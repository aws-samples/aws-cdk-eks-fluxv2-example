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

  public getManifest(): any {
    this.installManifest = yaml.loadAll(
      request.default('GET', this.manifestUrl)
        .getBody()
        .toString()
    );
    return this.installManifest;
  }
}

export class FluxV2 extends Construct {
  constructor(scope: Construct, id: string, props: FluxV2Props) {
    super(scope, id);

    // Actually install Flux components onto the cluster
    const fluxRelease = new FluxRelease(props.fluxVersion);
    const fluxManifest = props.cluster.addManifest('fluxManifest', ...fluxRelease.getManifest());

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
    gitRepoManifest.node.addDependency(fluxManifest);
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
    kustomizationManifest.node.addDependency(fluxManifest);
  }
}
