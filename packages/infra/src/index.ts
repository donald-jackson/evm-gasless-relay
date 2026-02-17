#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { StablecoinRelayStack } from "./stack.js";

const app = new cdk.App();

new StablecoinRelayStack(app, "StablecoinRelayStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
});
