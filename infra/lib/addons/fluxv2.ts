import { Construct } from 'constructs';
import { aws_iam as iam, StackProps } from 'aws-cdk-lib';
import { aws_eks as eks } from 'aws-cdk-lib';
import * as yaml from 'js-yaml';
import * as request from 'sync-request';

export interface FluxV2Props extends StackProps {
  cluster: eks.Cluster;
  fluxVersion?: string;
  secretName: string;
  repoUrl: string;
  repoBranch: string;
  repoPath: string;
}

class FluxRelease {
  private fluxVersion: string;
  private manifestUrl: string;
  public installManifest: any;

  constructor(version?: string) {
    if (!version) {
      this.fluxVersion = this.getLatestReleaseVersion();
    } else {
      this.fluxVersion = version;
    }
    this.manifestUrl = `https://github.com/fluxcd/flux2/releases/download/${this.fluxVersion}/install.yaml`
  }

  private getLatestReleaseVersion(): string {
    const metadataUrl = 'https://api.github.com/repos/fluxcd/flux2/releases/latest';
    const releaseMetadata = JSON.parse(
      request.default('GET', metadataUrl, {
        headers: {
          'User-Agent': 'CDK' // GH API requires us to set UA
        }
      }).getBody().toString()
    );

    return releaseMetadata.tag_name;
  }

  public getUrl(): string {
    return this.manifestUrl;
  }

  public getManifests(): Record<string, any>[] {
    this.installManifest = [];
    yaml.loadAll(
      request.default('GET', this.manifestUrl).getBody().toString(),
      (doc) => {
        const x = doc as Record<string, any>;
        this.installManifest.push(x);
      }
    );
    return this.installManifest;
  }

}

export class FluxV2 extends Construct {
  constructor(scope: Construct, id: string, props: FluxV2Props) {
    super(scope, id);

    /**
     * Actually installs Flux components onto the cluster. While perhaps not the prettiest implementation,
     * it should do the trick. We are breaking down the full install manifest into individual resources
     * so that they get applied individually, this way we avoid sending a too large payload to lambda.
     * 
     * We're also setting up ordered resource dependencies given the structure of the install.yaml, ensuring
     * our namespace is in place before we try applying other resources. With additional work the actual
     * dependencies could be identified and set up in detail to parallelize the effort of applying
     * the rest of the resources in the full manifest.
     */
    const fluxRelease = new FluxRelease(props.fluxVersion);
    const fluxResourceManifests = fluxRelease.getManifests();
    const fluxResourceNodes: Construct[] = [];
    fluxResourceManifests.forEach((m, i) => {
      const manifestResource = props.cluster.addManifest(`flux-${i}`, m);
      if (fluxResourceNodes.length > 0) {
        manifestResource.node.addDependency(fluxResourceNodes[fluxResourceNodes.length - 1]);
      }
      fluxResourceNodes.push(manifestResource);
    });

    // Bootstrap manifests
    const gitRepoManifest = props.cluster.addManifest('GitRepoSelf', {
      apiVersion: 'source.toolkit.fluxcd.io/v1beta1',
      kind: 'GitRepository',
      metadata: {
        name: 'flux-system',
        namespace: 'flux-system'
      },
      spec: {
        interval: '10m0s',
        ref: {
          branch: props.repoBranch,
        },
        secretRef: {
          name: props.secretName
        },
        url: props.repoUrl
      }  
    });
    gitRepoManifest.node.addDependency(fluxResourceNodes[fluxResourceNodes.length - 1]);
   
    const kustomizationManifest = props.cluster.addManifest('KustomizationSelf', {
      apiVersion: 'kustomize.toolkit.fluxcd.io/v1beta1',
      kind: 'Kustomization',
      metadata: {
        name: 'flux-system',
        namespace: 'flux-system'
      },
      spec: {
        interval: '10m0s',
        path: props.repoPath,
        prune: true,
        sourceRef: {
          kind: 'GitRepository',
          name: 'flux-system'
        },
        validation: 'client'
      }
    });
    kustomizationManifest.node.addDependency(fluxResourceNodes[fluxResourceNodes.length - 1]);
  }
}
