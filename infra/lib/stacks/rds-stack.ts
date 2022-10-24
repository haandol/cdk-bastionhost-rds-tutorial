import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Config } from '../configs/loader';

interface IProps extends StackProps {
  vpc: ec2.IVpc;
  defaultDatabaseName: string;
  enableBinlog: boolean;
}

export class RdsStack extends Stack {
  public readonly cluster: rds.IDatabaseCluster;
  public readonly securityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id);

    this.securityGroup = this.newSecurityGroup(props);
    this.cluster = this.newCluster(props, this.securityGroup);
  }

  newSecurityGroup(props: IProps): ec2.SecurityGroup {
    const securityGroup = new ec2.SecurityGroup(this, 'MySQLSecurityGroup', {
      vpc: props.vpc,
    });

    new CfnOutput(this, 'RdsSecurityGroupOutput', {
      exportName: `${Config.Ns}RdsSecurityGroup`,
      value: securityGroup.securityGroupId,
    });

    return securityGroup;
  }

  newCluster(
    props: IProps,
    securityGroup: ec2.ISecurityGroup
  ): rds.DatabaseCluster {
    const parameterGroup = new rds.ParameterGroup(this, 'MySQLParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_02_0,
      }),
    });
    parameterGroup.addParameter('sort_buffer_size', '2097152'); // 2MB

    if (props.enableBinlog) {
      parameterGroup.addParameter('binlog_format', 'ROW');
      parameterGroup.addParameter('binlog_row_image', 'FULL');
      parameterGroup.addParameter('binlog_checksum', 'NONE');
    }

    const cluster = new rds.DatabaseCluster(this, `${Config.Ns}RdsCluster`, {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_02_0,
      }),
      storageEncrypted: true,
      instanceProps: {
        vpc: props.vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.R5,
          ec2.InstanceSize.XLARGE
        ),
      },
      defaultDatabaseName: props.defaultDatabaseName,
      clusterIdentifier: `${Config.Ns}RdsCluster`,
      removalPolicy: RemovalPolicy.DESTROY,
      parameterGroup,
      cloudwatchLogsRetention: logs.RetentionDays.SIX_MONTHS,
    });
    cluster.addRotationSingleUser();
    cluster.connections.allowDefaultPortFrom(securityGroup);

    new CfnOutput(this, 'RdsSecretsOutput', {
      exportName: `${Config.Ns}RdsSecrets`,
      value: cluster.secret?.secretArn || '',
    });

    return cluster;
  }
}
