import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as eventsources from "aws-cdk-lib/aws-lambda-event-sources";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export class StablecoinRelayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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

    // --- API Gateway ---

    const httpApi = new apigatewayv2.HttpApi(this, "RelayApi", {
      apiName: "stablecoin-relay",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST],
        allowHeaders: ["Content-Type"],
      },
    });

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

    // --- Outputs ---

    new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.apiEndpoint,
      description: "API Gateway endpoint URL",
    });

    new cdk.CfnOutput(this, "QueueUrl", {
      value: relayQueue.queueUrl,
      description: "SQS queue URL for relay requests",
    });
  }
}
