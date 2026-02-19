import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as eventsources from "aws-cdk-lib/aws-lambda-event-sources";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as events from "aws-cdk-lib/aws-events";
import * as eventTargets from "aws-cdk-lib/aws-events-targets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import type { Construct } from "constructs";

export class StablecoinRelayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Custom Domain (optional) ---

    const domainName = this.node.tryGetContext("domainName") as string | undefined;
    let certificate: acm.ICertificate | undefined;
    let domainNames: string[] | undefined;
    let hostedZone: route53.IHostedZone | undefined;

    if (domainName) {
      // CloudFront requires ACM certificates in us-east-1
      if (!cdk.Token.isUnresolved(this.region) && this.region !== "us-east-1") {
        throw new Error("Custom domain requires stack deployed in us-east-1");
      }

      const zoneName = domainName.split(".").slice(1).join(".");
      hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
        domainName: zoneName,
      });

      certificate = new acm.Certificate(this, "Certificate", {
        domainName,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });

      domainNames = [domainName];
    }

    // --- DynamoDB Tables ---

    const transactionsTable = new dynamodb.Table(this, "Transactions", {
      tableName: "StablecoinRelay-Transactions",
      partitionKey: { name: "requestId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const walletPoolTable = new dynamodb.Table(this, "WalletPool", {
      tableName: "StablecoinRelay-WalletPool",
      partitionKey: { name: "chainId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "address", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const noncesTable = new dynamodb.Table(this, "Nonces", {
      tableName: "StablecoinRelay-Nonces",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const sweepAuditTable = new dynamodb.Table(this, "SweepAudit", {
      tableName: "StablecoinRelay-SweepAudit",
      partitionKey: { name: "cycleId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "expiresAt",
    });

    // --- Secrets Manager ---

    const walletSeedSecret = new secretsmanager.Secret(this, "WalletSeed", {
      secretName: "stablecoin-relay/hd-wallet-seed",
      description: "HD wallet seed phrase for relay EOAs",
    });

    // --- SQS Queue ---

    const dlq = new sqs.Queue(this, "RelayRequestsDLQ", {
      queueName: "relay-requests-dlq",
      retentionPeriod: cdk.Duration.days(14),
    });

    const relayQueue = new sqs.Queue(this, "RelayRequests", {
      queueName: "relay-requests",
      visibilityTimeout: cdk.Duration.minutes(5),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
    });

    // --- Lambda Functions ---

    const lambdaDefaults: lambda.FunctionProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      handler: "index.handler",
      code: lambda.Code.fromInline("exports.handler = async () => ({ statusCode: 200 })"),
      environment: {
        SQS_QUEUE_URL: relayQueue.queueUrl,
        ...(this.node.tryGetContext("relayContracts")
          ? { RELAY_CONTRACTS_JSON: this.node.tryGetContext("relayContracts") }
          : {}),
      },
    };

    const chainsHandler = new lambda.Function(this, "ChainsHandler", {
      ...lambdaDefaults,
      functionName: "stablecoin-relay-chains",
    });

    const quoteHandler = new lambda.Function(this, "QuoteHandler", {
      ...lambdaDefaults,
      functionName: "stablecoin-relay-quote",
    });

    const submitHandler = new lambda.Function(this, "SubmitHandler", {
      ...lambdaDefaults,
      functionName: "stablecoin-relay-submit",
    });
    transactionsTable.grantReadWriteData(submitHandler);
    relayQueue.grantSendMessages(submitHandler);

    const statusHandler = new lambda.Function(this, "StatusHandler", {
      ...lambdaDefaults,
      functionName: "stablecoin-relay-status",
    });
    transactionsTable.grantReadData(statusHandler);

    const healthHandler = new lambda.Function(this, "HealthHandler", {
      ...lambdaDefaults,
      functionName: "stablecoin-relay-health",
    });
    walletPoolTable.grantReadData(healthHandler);

    // --- Worker Lambda ---

    const workerHandler = new lambda.Function(this, "WorkerHandler", {
      ...lambdaDefaults,
      functionName: "stablecoin-relay-worker",
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });

    transactionsTable.grantReadWriteData(workerHandler);
    walletPoolTable.grantReadWriteData(workerHandler);
    noncesTable.grantReadWriteData(workerHandler);
    walletSeedSecret.grantRead(workerHandler);

    workerHandler.addEventSource(
      new eventsources.SqsEventSource(relayQueue, {
        batchSize: 1,
      }),
    );

    // --- Sweep Lambda ---

    const sweepHandler = new lambda.Function(this, "SweepHandler", {
      ...lambdaDefaults,
      functionName: "stablecoin-relay-sweeper",
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      reservedConcurrentExecutions: 1,
    });

    walletPoolTable.grantReadWriteData(sweepHandler);
    noncesTable.grantReadWriteData(sweepHandler);
    sweepAuditTable.grantReadWriteData(sweepHandler);
    walletSeedSecret.grantRead(sweepHandler);

    // EventBridge rule: run sweep every 2 hours
    const sweepScheduleRule = new events.Rule(this, "SweepScheduleRule", {
      ruleName: "stablecoin-relay-sweep-schedule",
      schedule: events.Schedule.rate(cdk.Duration.hours(2)),
    });
    sweepScheduleRule.addTarget(new eventTargets.LambdaFunction(sweepHandler));

    // --- API Gateway ---

    const httpApi = new apigatewayv2.HttpApi(this, "RelayApi", {
      apiName: "stablecoin-relay",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST],
        allowHeaders: ["Content-Type"],
      },
    });

    // Rate limiting via default stage throttle settings
    const defaultStage = httpApi.defaultStage?.node.defaultChild as apigatewayv2.CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingBurstLimit: 50, // Max concurrent requests
      throttlingRateLimit: 100, // Requests per second
    };

    httpApi.addRoutes({
      path: "/chains",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("ChainsIntegration", chainsHandler),
    });

    httpApi.addRoutes({
      path: "/relay/quote",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("QuoteIntegration", quoteHandler),
    });

    httpApi.addRoutes({
      path: "/relay/submit",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("SubmitIntegration", submitHandler),
    });

    httpApi.addRoutes({
      path: "/relay/status/{requestId}",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("StatusIntegration", statusHandler),
    });

    httpApi.addRoutes({
      path: "/health",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("HealthIntegration", healthHandler),
    });

    // --- WAF WebACL (CloudFront) ---

    const SANCTIONED_COUNTRIES = ["CU", "IR", "KP", "SY", "RU"];

    const webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
      name: "stablecoin-relay-waf",
      scope: "CLOUDFRONT",
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "stablecoin-relay-waf",
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: "GeoBlockSanctionedCountries",
          priority: 1,
          action: { block: {} },
          statement: {
            geoMatchStatement: { countryCodes: SANCTIONED_COUNTRIES },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "GeoBlockSanctionedCountries",
            sampledRequestsEnabled: true,
          },
        },
        {
          name: "RateLimitPerIP",
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              aggregateKeyType: "IP",
              limit: 2000,
              evaluationWindowSec: 300,
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: "RateLimitPerIP",
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // --- CloudWatch Alarms ---

    // Worker errors (failed relays > 5 per minute)
    const workerErrorMetric = workerHandler.metricErrors({
      period: cdk.Duration.minutes(1),
      statistic: "Sum",
    });
    new cloudwatch.Alarm(this, "WorkerErrorAlarm", {
      alarmName: "stablecoin-relay-worker-errors",
      alarmDescription: "Worker Lambda errors exceed 5 per minute",
      metric: workerErrorMetric,
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // Queue depth > 100 messages
    const queueDepthMetric = relayQueue.metricApproximateNumberOfMessagesVisible({
      period: cdk.Duration.minutes(1),
      statistic: "Maximum",
    });
    new cloudwatch.Alarm(this, "QueueDepthAlarm", {
      alarmName: "stablecoin-relay-queue-depth",
      alarmDescription: "SQS queue depth exceeds 100 messages",
      metric: queueDepthMetric,
      threshold: 100,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // DLQ messages (messages landing in dead letter queue)
    const dlqDepthMetric = dlq.metricApproximateNumberOfMessagesVisible({
      period: cdk.Duration.minutes(5),
      statistic: "Sum",
    });
    new cloudwatch.Alarm(this, "DLQAlarm", {
      alarmName: "stablecoin-relay-dlq-messages",
      alarmDescription: "Messages appearing in dead letter queue",
      metric: dlqDepthMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    // Metric filter for "Relay failed" log entries from worker
    const workerLogGroup = workerHandler.logGroup;
    const failedRelayMetricFilter = new logs.MetricFilter(this, "FailedRelayMetricFilter", {
      logGroup: workerLogGroup,
      filterPattern: logs.FilterPattern.literal('"Relay failed"'),
      metricNamespace: "StablecoinRelay",
      metricName: "FailedRelays",
      metricValue: "1",
    });
    new cloudwatch.Alarm(this, "FailedRelayAlarm", {
      alarmName: "stablecoin-relay-failed-relays",
      alarmDescription: "Failed relay transactions detected in worker logs",
      metric: failedRelayMetricFilter.metric({
        period: cdk.Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    const wafBlockedMetric = new cloudwatch.Metric({
      namespace: "AWS/WAFV2",
      metricName: "BlockedRequests",
      dimensionsMap: {
        WebACL: "stablecoin-relay-waf",
        Region: "us-east-1",
        Rule: "ALL",
      },
      period: cdk.Duration.minutes(5),
      statistic: "Sum",
    });
    new cloudwatch.Alarm(this, "WafBlockedRequestsAlarm", {
      alarmName: "stablecoin-relay-waf-blocked",
      alarmDescription: "WAF blocked requests exceed 100 per 5 minutes",
      metric: wafBlockedMetric,
      threshold: 100,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // --- Sweep Alarms ---

    const sweepErrorMetric = sweepHandler.metricErrors({
      period: cdk.Duration.minutes(5),
      statistic: "Sum",
    });
    new cloudwatch.Alarm(this, "SweepErrorAlarm", {
      alarmName: "stablecoin-relay-sweep-errors",
      alarmDescription: "Sweep Lambda errors detected",
      metric: sweepErrorMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    const sweepDurationMetric = sweepHandler.metricDuration({
      period: cdk.Duration.minutes(10),
      statistic: "Maximum",
    });
    new cloudwatch.Alarm(this, "SweepDurationAlarm", {
      alarmName: "stablecoin-relay-sweep-duration",
      alarmDescription: "Sweep Lambda duration exceeds 8 minutes",
      metric: sweepDurationMetric,
      threshold: 480000, // 8 minutes in ms
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    const sweepLogGroup = sweepHandler.logGroup;
    const sweepCycleFailedFilter = new logs.MetricFilter(this, "SweepCycleFailedMetricFilter", {
      logGroup: sweepLogGroup,
      filterPattern: logs.FilterPattern.literal('"Sweep cycle failed"'),
      metricNamespace: "StablecoinRelay",
      metricName: "SweepCycleFailed",
      metricValue: "1",
    });
    new cloudwatch.Alarm(this, "SweepCycleFailedAlarm", {
      alarmName: "stablecoin-relay-sweep-cycle-failed",
      alarmDescription: "Sweep cycle failures detected in logs",
      metric: sweepCycleFailedFilter.metric({
        period: cdk.Duration.minutes(15),
        statistic: "Sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    // --- S3 Bucket for SPA ---

    const webBucket = new s3.Bucket(this, "WebBucket", {
      bucketName: `stablecoin-relay-web-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- CloudFront Distribution ---

    const apiOrigin = new origins.HttpOrigin(
      `${httpApi.httpApiId}.execute-api.${this.region}.amazonaws.com`,
    );

    const distribution = new cloudfront.Distribution(this, "WebDistribution", {
      domainNames,
      certificate,
      webAclId: webAcl.attrArn,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responsePagePath: "/index.html",
          responseHttpStatus: 200,
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responsePagePath: "/index.html",
          responseHttpStatus: 200,
          ttl: cdk.Duration.seconds(0),
        },
      ],
      additionalBehaviors: {
        "/chains": {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        "/relay/*": {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        "/health": {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // --- Route53 Alias Records ---

    if (domainName && hostedZone) {
      new route53.ARecord(this, "SiteAliasRecord", {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });
      new route53.AaaaRecord(this, "SiteAliasRecordV6", {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });
    }

    // --- Outputs ---

    new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.apiEndpoint,
      description: "API Gateway endpoint URL",
    });

    new cdk.CfnOutput(this, "QueueUrl", {
      value: relayQueue.queueUrl,
      description: "SQS queue URL for relay requests",
    });

    new cdk.CfnOutput(this, "WebBucketName", {
      value: webBucket.bucketName,
      description: "S3 bucket for SPA static files",
    });

    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "CloudFront distribution URL",
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
      description: "CloudFront distribution ID (for cache invalidation)",
    });

    new cdk.CfnOutput(this, "WebAclArn", {
      value: webAcl.attrArn,
      description: "WAF WebACL ARN attached to CloudFront",
    });

    if (domainName) {
      new cdk.CfnOutput(this, "CustomDomainUrl", {
        value: `https://${domainName}`,
        description: "Custom domain URL",
      });
    }
  }
}
