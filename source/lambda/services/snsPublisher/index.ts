import {
  getNotificationMutingStatus,
  logger,
  sendAnonymousMetric,
  SSMHelper,
  stringEqualsIgnoreCase,
} from "solutions-utils";
import { SNSPublisher } from "./lib/sns-publish";

const moduleName = <string>__filename.split("/").pop();

export const handler = async (event: any) => {
  const eventText = JSON.stringify(event);
  logger.debug(`Received event: ${eventText}`);
  const ssm = new SSMHelper();
  const ssmNotificationMutingConfigParamName = <string>(
    process.env.QM_NOTIFICATION_MUTING_CONFIG_PARAMETER
  );
  const mutingConfiguration: string[] = await ssm.getParameter(
    ssmNotificationMutingConfigParamName
  );
  logger.debug(`mutingConfiguration ${JSON.stringify(mutingConfiguration)}`);
  const service = event["detail"]["check-item-detail"]["Service"];
  const limitName = event["detail"]["check-item-detail"]["Limit Name"];
  const limitCode = event["detail"]["check-item-detail"]["Limit Code"];
  const resource = event["detail"]["check-item-detail"]["Resource"];
  const notificationMutingStatus = getNotificationMutingStatus(
    mutingConfiguration,
    {
      service: service,
      quotaName: limitName,
      quotaCode: limitCode,
      resource: resource,
    }
  );
  if (!notificationMutingStatus.muted) {
    const snsPublisher = new SNSPublisher();
    try {
      await snsPublisher.publish(eventText);
      const message = "Successfully published to topic";
      logger.debug(message);
      if (stringEqualsIgnoreCase(<string>process.env.SEND_METRIC, "Yes")) {
        await sendMetric({
            Region: event["detail"]["check-item-detail"]["Region"],
            Service: service,
            LimitName: limitName,
            LimitCode: limitCode,
            Status: event["detail"]["status"],
          },
          "Alert notification"
        );
      }
      return { message: message };
    } catch (error) {
      logger.error(error);
      return error;
    }
  } else {
    logger.debug(notificationMutingStatus.message);
    return {
      message: "Processed event, notification not sent",
      reason: notificationMutingStatus.message,
    };
  }

  async function sendMetric(
    data: { [key: string]: string | number | boolean },
    message = ""
  ) {
    const metric = {
      UUID: <string>process.env.SOLUTION_UUID,
      Solution: <string>process.env.SOLUTION_ID,
      TimeStamp: new Date().toISOString().replace("T", " ").replace("Z", ""), // Date and time instant in a java.sql.Timestamp compatible format,
      Data: {
        Event: "AlertNotification",
        Version: <string>process.env.VERSION,
        ...data,
      },
    };
    try {
      await sendAnonymousMetric(<string>process.env.METRICS_ENDPOINT, metric);
      logger.info({
        label: `${moduleName}/sendMetric`,
        message: `${message} metric sent successfully`,
      });
    } catch (error) {
      logger.warn({
        label: `${moduleName}/sendMetric`,
        message: `${message} metric failed ${error}`,
      });
    }
  }
};
