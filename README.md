# EKS with GitOps using Flux, deployed using AWS CDK

This repository contains an example CDK application that creates an EKS cluster with a few basic
add-ons to get started with GitOps using FluxV2. The CDK code is housed in the `infra/` directory.

Making it easy to get started, the infrastructure provisioned also includes VPC, NAT Gateways, etc.
This could, and should of course be tailored to your specific needs.

## Add-ons part of infra or applied by Flux?

Some of the add-ons, such as cluster autoscaler and AWS Load Balancer Controller, do require
additional permissions in IAM to properly function, to modify auto scaling groups and load balancers
respectively. Hence, these types of addons, are considered part of the infrastructure and
provisioned using AWS CDK. Flux is also included here due it is part of the bootstrapping process.

The remaining add-ons, such as metrics server, and other addons you want to run which do not fit
into the former category, will be applied by Flux in a GitOps fashion.

## How does it work?

The `infra/` directory contains all resources which are created using AWS CDK, including add-ons as
described above. Once those resources are created, Flux will look at the content of `k8s-config/`,
and create Kubernetes resources accordingly.

### Pre-requisites

This example relies on [AWS Cloud Development Kit (CDK)](https://aws.amazon.com/cdk/) for management
of infrastructure. If you are not yet familiar with CDK or need to install CDK on your laptop, see
the [CDK getting started guide](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html).

The goal of this sample is not to provide in-depth coverage of all the features and components
available in FluxV2, for further information on the various components and available configuration,
see [GitOps Toolkit](https://toolkit.fluxcd.io/).

### 1. Deploy the infrastructure

Jump into the the `infra/` directory and deploy the CDK stack, passing along a set of parameters to
the CDK command. These parameters define which git repository, branch, and path in that repository
that will be used for initial flux bootstrapping of the cluster.

```shell
cd infra/

npm i

cdk deploy InfraStack \
  --parameters FluxRepoURL="ssh://git@github.com/aws-samples/aws-cdk-eks-fluxv2-example" \
  --parameters FluxRepoBranch="main" \
  --parameters FluxRepoPath="./k8s-config/clusters/demo"
```

As you can see, multiple cluster configurations could be added to the `k8s-config/clusters/<cluster-name>` path.

The installation and configuration of flux is managed in `infra/lib/addons/fluxv2.ts`.

### 2. Connecting with GitHub

Flux is configured to connect to a GitHub repository, targeting a specific path, connecting using
the data from ssh keypair that we will create. We will be using this generic method for
authentication as opposed to a GitHub personal access token for easier adaptability to other code
hosting solutions.

#### 2.1 Create an ssh keypair

First, create a keypair using `ssh-keygen -C demokey -N "" -f $HOME/.ssh/demo_key_rsa`. Then, upload
the public part to GitHub in your [settings page](https://github.com/settings/keys).

#### 2.2 Create a Kubernetes secret

Use the following script to craft and apply the secret to the `flux-system` namespace:

```bash
#!/bin/sh

cat <<EOF | kubectl -n flux-system apply -f -
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  name: github-keypair
  namespace: flux-system
data:
  known_hosts: $(ssh-keyscan -t rsa github.com 2>/dev/null|grep -E '^github\.com'|base64)
  identity: $(cat ${HOME}/.ssh/demo_key_rsa|base64)
  'identity.pub': $(cat ${HOME}/.ssh/demo_key_rsa.pub|base64)
EOF
```

Note: update the `infra-stack.ts` file to reference the correct secret if you change the name.

### 3. Trigger flux reconciliation

Wait for the state to be [reconciled](https://toolkit.fluxcd.io/core-concepts/#reconciliation) as
defined in the `interval` field on the various flux component specs.
Alternatively, if you have the [Flux CLI installed](https://toolkit.fluxcd.io/guides/installation/#install-the-flux-cli),
you can manually trigger reconciliation of resources using
`flux reconcile kustomization flux-system --with-source`. This will ask flux to ensure that the
cluster state matches the desired state, for more information, see the
[reconciliation section](https://toolkit.fluxcd.io/core-concepts/#reconciliation) in the flux docs.

```shell
# kubectl -n podinfo get pods
NAME                      READY   STATUS    RESTARTS   AGE
podinfo-746d58c87-gjkdl   1/1     Running   0          2m3s
podinfo-746d58c87-qfjwk   1/1     Running   0          2m3s
```

### 4. (Alternative) Using AWS CodeCommit for source control
You can also use [AWS CodeCommit](https://aws.amazon.com/codecommit/) to host your private repository. In order to do so, follow the step below.

#### 4.1. Create and clone your AWS Codecommit repository

Create an AWS Codecommit repository using 
```
aws codecommit create-repository --repository-name MyDemoRepo --repository-description "My demonstration repository"
```

Setup your git credentials in AWS IAM following those [instructions](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-gc.html).

Clone the repository using the below command. Replace `YOUR-AWS_REGION` with your AWS region (e.g. eu-west-1). Use your newly created git credentials when asked for.
```
git clone https://git-codecommit.<YOUR-AWS_REGION>.amazonaws.com/v1/repos/MyDemoRepo my-demo-repo
```

#### 4.2. Copy and Push the GitHub repository content to your new repository

Clone the repository `git clone https://github.com/aws-samples/aws-cdk-eks-fluxv2-example.git ./github-repository`

copy the content to our AWS Codecommit repository `cp github-repository/k8s-config  my-demo-repo/k8s-config`

Commit the changes `cd my-demo-repo & git commit -m "first commit"`

Push the changes `git push`

#### 4.3. Setting up the SSH connection to AWS Codecommit

Follow Step 3 of on this [page](https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-ssh-unixes.html) of the AWS Codecommit documentation.

#### 4.4. Deploy the infrastructure

Jump into the the `infra/` directory and deploy the CDK stack, passing along a set of parameters to
the CDK command. These parameters define which git repository, branch, and path in that repository
that will be used for initial flux bootstrapping of the cluster.

```shell
cd infra/

npm i

cdk deploy InfraStack \
  --parameters FluxRepoURL="ssh://<YOUR_SSH_KEY_ID>@git-codecommit.<YOUR_AWS_REGION>.amazonaws.com/v1/repos/MyDemoRepo" \
  --parameters FluxRepoBranch="master" \
  --parameters FluxRepoPath="./k8s-config/clusters/demo"
```

### 4.5. Create a Kubernetes secret

```bash
#!/bin/sh
cat <<EOF | kubectl -n flux-system apply -f -
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  name: codecommit-keypair
  namespace: flux-system
data:
  known_hosts: $(ssh-keyscan -t rsa git-codecommit.<YOUR-AWS-REGION>.amazonaws.com 2>/dev/null|grep -E '^git-codecommit.<YOUR-AWS-REGION>.amazonaws\.com'|base64 | tr -d '\n')
  identity: $(cat ${HOME}/.ssh/codecommit_rsa |base64 | tr -d '\n')
  'identity.pub': $(cat ${HOME}/.ssh/codecommit_rsa.pub|base64 | tr -d '\n')
EOF
```

## Security

See [CONTRIBUTING](CONTRIBUTING.md) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
