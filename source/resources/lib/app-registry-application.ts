// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as cdk from "aws-cdk-lib";
import { Aws, Fn, Tags } from "aws-cdk-lib";
import * as appreg from "@aws-cdk/aws-servicecatalogappregistry-alpha";
import { Construct } from "constructs";

export interface AppRegistryApplicationProps extends cdk.StackProps {
    appRegistryApplicationName: string;
    solutionId: string
}

export class AppRegistryApplication extends Construct {
    constructor(scope: Construct, id: string, props: AppRegistryApplicationProps ) {
    super(scope, id);
    
    const application = new appreg.Application(this, "AppRegistryApplication", {
        applicationName: Fn.join("-", [
        props.appRegistryApplicationName,
        Aws.REGION,
        Aws.ACCOUNT_ID,
    ]),
    description: `Service Catalog application to track and manage all your resources for the solution ${this.node.tryGetContext("SOLUTION_NAME")}`,
    });

    application.associateApplicationWithStack(cdk.Stack.of(this))

    application.addAttributeGroup('ApplicationAttributeGroup', {
        attributeGroupName: Fn.join("-", [
            props.appRegistryApplicationName,
            Aws.REGION,
            Aws.ACCOUNT_ID,
        ]),
        description: "Attribute group for application information",
        attributes: {
            solutionID: props.solutionId,
            solutionName: this.node.tryGetContext("SOLUTION_NAME"),
            version: this.node.tryGetContext("SOLUTION_VERSION"),
            applicationType: this.node.tryGetContext("APPLICATION_TYPE"),
        }
    })

    // Tags for application
    Tags.of(application).add("SolutionID", props.solutionId);
    Tags.of(application).add("SolutionName", this.node.tryGetContext("SOLUTION_NAME"));
    Tags.of(application).add("SolutionVersion", this.node.tryGetContext("SOLUTION_VERSION"));
    Tags.of(application).add("ApplicationType", this.node.tryGetContext("APPLICATION_TYPE"));
    }
}

