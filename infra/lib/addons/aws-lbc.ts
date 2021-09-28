import cdk = require('@aws-cdk/core');
import eks = require('@aws-cdk/aws-eks');
import iam = require('@aws-cdk/aws-iam');
import * as yaml from 'js-yaml';
import * as request from 'sync-request';

export interface AWSLoadBalancerControllerProps extends cdk.StackProps {
  cluster: eks.Cluster;
  namespace: string;
}

export class AWSLoadBalancerController extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: AWSLoadBalancerControllerProps) {
    super(scope, id);

    const sa = props.cluster.addServiceAccount('aws-lbc', {
      namespace: props.namespace
    });

    sa.role.addManagedPolicy({
      managedPolicyArn: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy`
    });

    const awsLbcCrdsUrl = 'https://raw.githubusercontent.com/aws/eks-charts/master/stable/aws-load-balancer-controller/crds/crds.yaml'
    const awsLbcCrdsManifest : any = yaml.loadAll(request.default('GET', awsLbcCrdsUrl).getBody().toString());
    const awsLbcCrdsManifestResource = props.cluster.addManifest('awsLbcCrdManifest', ...awsLbcCrdsManifest);
    
    const chart = props.cluster.addHelmChart('AWSLBCHelmChart', {
      chart: 'aws-load-balancer-controller',
      release: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: props.namespace,
      createNamespace: false,
      values: {
        'clusterName': `${props.cluster.clusterName}`,
        'serviceAccount': {
          'create': false,
          'name': sa.serviceAccountName,
          'annotations': {
            'eks.amazonaws.com/role-arn': sa.role.roleArn
          }
        }
      }
    });
    chart.node.addDependency(awsLbcCrdsManifestResource);
  }
}