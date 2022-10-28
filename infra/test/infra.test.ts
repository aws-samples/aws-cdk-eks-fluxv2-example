import { App } from 'aws-cdk-lib';
import { Capture, Match, Template } from 'aws-cdk-lib/assertions';
import { InfraStack } from '../lib/infra-stack';

describe('Stack contains resources', () => {
  const app = new App();
  const stack = new InfraStack(app, 'test-stack');
  const template = Template.fromStack(stack);

  test('Creates VPC with Subnets', () => {
    template.hasResource('AWS::EC2::VPC', {});
    template.resourceCountIs('AWS::EC2::Subnet', 4);
  });

  test('EKS cluster created', () => {
    template.hasResource('Custom::AWSCDK-EKS-Cluster', {});

  });

  // Test that it's a supported version
  test('EKS cluster with supported Kubernetes version', () => {
    // This is a non-ideal way of validating supported versions, but seems to work.
    const supportedVersionsRegex = '1.19|1.20|1.21|1.22|1.23';
    template.hasResourceProperties('Custom::AWSCDK-EKS-Cluster', {
      Config: {
        version: Match.stringLikeRegexp(supportedVersionsRegex)
      }
    });
  });

});