// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as https from "https";
import { URL } from "url";
import { logger, SSMHelper } from "solutions-utils";

interface MessageResponse {
  body: string;
  statusCode?: number;
  statusMessage?: string;
}

/**
 * Sends notification to Slack Webhook
 *
 * @class SlackNotifier
 */
export class SlackNotifier {
  slackHookParameter;
  ssmHelper;

  constructor() {
    this.ssmHelper = new SSMHelper();
    this.slackHookParameter = <string>process.env.SLACK_HOOK;
  }

  /**
   * Sends slack notification
   * @param  {CWEvent}    event           [triggering event]
   */
  async sendNotification(event: any) {
    try {
      const slackUrl = (await this.ssmHelper.getParameter(this.slackHookParameter, true))[0];

      const slackMessage = this.slackMessageBuilder(event);
      const processEventResponse = await this.processEvent(slackUrl, slackMessage);

      return {
        result: processEventResponse,
      };
    } catch (error) {
      return {
        result: "error",
      };
    }
  }

  /**
   * [slackMessageBuilder description]
   * @param  {[type]} event [description]
   * @return {[type]}       [description]
   */
  private slackMessageBuilder(event: any) {
    let _notifyColor = "#93938f";
    if (event.detail["status"] === "OK") _notifyColor = "#36a64f";
    else if (event.detail["status"] === "WARN") _notifyColor = "#eaea3c";
    else if (event.detail["status"] === "ERROR") _notifyColor = "#bf3e2d";

    let _status = event.detail["status"];
    if (_status === "OK") _status = `🆗`;
    else if (_status === "WARN") _status = `⚠️`;
    else if (_status === "ERROR") _status = `🔥`;

    /*
     * SO-Limit-M-41 - 07/30/2018 - Slack mapping
     * Fixed slack notification mapping
     */
    return {
      attachments: [
        {
          color: _notifyColor,
          fields: [
            {
              title: "AccountId",
              value: `${event.account}`,
              short: true,
            },
            {
              title: "Status",
              value: _status,
              short: true,
            },
            {
              title: "TimeStamp",
              value: event.detail["check-item-detail"]["Timestamp"] ?? event.time,
              short: true,
            },
            {
              title: "Region",
              value: `${event.detail["check-item-detail"]["Region"]}`,
              short: true,
            },
            {
              title: "Service",
              value: `${event.detail["check-item-detail"]["Service"]}`,
              short: true,
            },
            {
              title: "LimitName",
              value: `${event.detail["check-item-detail"]["Limit Name"]}`,
              short: true,
            },
            {
              title: "CurrentUsage",
              value: `${event.detail["check-item-detail"]["Current Usage"]}`,
              short: true,
            },
            {
              title: "LimitAmount",
              value: `${event.detail["check-item-detail"]["Limit Amount"]}`,
              short: true,
            },
          ],
          pretext: "*Quota Monitor for AWS Update*",
          fallback: "new notification from Quota Monitor for AWS",
          author_name: "@quota-monitor-for-aws",
          title: "Quota Monitor for AWS Documentation",
          title_link: "https://aws.amazon.com/solutions/implementations/quota-monitor/",
          footer: "Take Action?",
          actions: [
            {
              text: "Request Limit Increase",
              type: "button",
              url: event.quotaIncreaseLink || "https://console.aws.amazon.com/servicequotas/home",
            },
          ],
        },
      ],
    };
  }

  /**
   * [postMessage description]
   * @param  {[type]}   message  [description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  async postMessage(slackUrl: string, message: string): Promise<MessageResponse> {
    const messageBody = JSON.stringify(message);
    const url = new URL(slackUrl);
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(messageBody),
      },
    };

    return new Promise((resolve) => {
      const postReq = https.request(url, options, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            body: body,
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
          });
        });
      });

      postReq.write(messageBody);
      postReq.end();
    });
  }

  /**
   * [processEvent description]
   * @param  {[type]}   slackconfig [description]
   * @return {[type]}               [description]
   */
  async processEvent(slackUrl: string, slackMessage: any) {
    const response = await this.postMessage(slackUrl, slackMessage);

    if (response.statusCode && response.statusCode < 400) {
      return "Message posted successfully";
    } else if (response.statusCode && response.statusCode < 500) {
      logger.warn(`Error posting message to Slack API: ${response.statusCode} - ${response.statusMessage}`);
      return response.statusMessage;
    } else {
      // Let Lambda retry
      return `Server error when processing message: ${response.statusCode} - ${response.statusMessage}`;
    }
  }
}
