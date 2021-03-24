import cdk = require('@aws-cdk/core');
import eks = require('@aws-cdk/aws-eks');
import iam = require('@aws-cdk/aws-iam');

export interface ClusterAutoscalerProps extends cdk.StackProps {
  cluster: eks.Cluster
}

export class ClusterAutoscaler extends cdk.Construct {
  private namespace: string;
  constructor(scope: cdk.Construct, id: string, props: ClusterAutoscalerProps) {
    super(scope, id);

    this.namespace = 'cluster-autoscaler';

    // Create namespace for CA
    props.cluster.addManifest('CANamespace',
      {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: this.namespace
        } 
      }
    );

    // IRSA setup
    const sa = props.cluster.addServiceAccount('cluster-autoscaler', {
      namespace: this.namespace
    });

    const caPolicy = new iam.Policy(this, 'CAPolicy', {
      roles: [sa.role],
      statements: [
        new iam.PolicyStatement({
          actions: [
            'autoscaling:DescribeAutoScalingGroups',
            'autoscaling:DescribeAutoScalingInstances',
            'autoscaling:DescribeLaunchConfigurations',
            'autoscaling:DescribeTags',
            'ec2:DescribeLaunchTemplateVersions'
          ],
          resources: ['*']
        }),
        new iam.PolicyStatement({
          actions: [
            'autoscaling:SetDesiredCapacity',
            'autoscaling:TerminateInstanceInAutoScalingGroup',
            'autoscaling:UpdateAutoScalingGroup'
          ],
          resources: ['*'],
          conditions: {
            'StringEquals': {
              'autoscaling:ResourceTag/k8s.io/cluster-autoscaler/enabled': 'true'
            }
          }
        })
      ]
    });

    props.cluster.addHelmChart('CAHelm', {
      chart: 'cluster-autoscaler-chart',
      release: 'ca',
      repository: 'https://kubernetes.github.io/autoscaler',
      namespace: this.namespace,
      createNamespace: false,
      values: {
        'autoDiscovery': {
          'clusterName': `${props.cluster.clusterName}`
        },
        'awsRegion': cdk.Aws.REGION,
        'rbac': {
          'serviceAccount': {
            'create': false,
            'name': sa.serviceAccountName,
            'annotations': {
              'eks.amazonaws.com/role-arn': sa.role.roleArn
            }
          }
        }
      }
    });
  }
}