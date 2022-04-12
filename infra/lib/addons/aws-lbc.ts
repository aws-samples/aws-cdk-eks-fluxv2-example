import { Construct } from 'constructs';
import { Aws, StackProps } from 'aws-cdk-lib';
import { aws_eks as eks } from 'aws-cdk-lib';

export interface AWSLoadBalancerControllerProps extends StackProps {
  cluster: eks.Cluster;
  namespace: string;
}

export class AWSLoadBalancerController extends Construct {
  constructor(scope: Construct, id: string, props: AWSLoadBalancerControllerProps) {
    super(scope, id);

    const sa = props.cluster.addServiceAccount('aws-lbc', {
      namespace: props.namespace
    });

    sa.role.addManagedPolicy({
      managedPolicyArn: `arn:aws:iam::${Aws.ACCOUNT_ID}:policy/AWSLoadBalancerControllerIAMPolicy`
    });

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
  }
}