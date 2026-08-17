# Nav's Quota Monitor for AWS Lab Notes

**Date:** August 17, 2026
**Goal:** Learn how a platform team detects AWS quota risk before it causes a deployment or scaling failure.

## What I deployed

I used the AWS Solutions **Quota Monitor for AWS** templates to create a short-lived lab in `us-east-1`.

- **Hub stack:** `quota-monitor-hub-lab`
- **Spoke stack:** `quota-monitor-sq-spoke-lab`
- **Warning threshold:** 80% utilization
- **Notification path:** Amazon SNS email
- **Schedule:** once per day, kept intentionally low-cost for the lab

The hub receives centralized quota events. The spoke checks monitored account and Region quota utilization, then sends events to the hub.

```text
Quota Monitor spoke Lambda
        -> Amazon EventBridge
        -> Quota Monitor hub
        -> Amazon SNS
        -> Email notification
```

## Safe end-to-end test

Rather than exhaust a real AWS quota, I invoked the spoke poller Lambda with the solution's supported test event:

```json
{
  "detail-type": "QM Lambda Test Event",
  "test-type": "WARN"
}
```

The invocation succeeded and delivered an SNS email. The received event reported a synthetic `WARN` result with `Current Usage: 80%`. Values such as `QmTestService` and `qm-test-region` are test data, not real AWS resources or quotas.

## The real-world problem this solves

AWS quotas can silently prevent capacity changes. For example, an EKS cluster might be unable to add EC2 nodes, a deployment might hit Lambda concurrency, or an incident response might be blocked from creating network resources.

Quota Monitor turns that late discovery into an early warning. A platform team can remove unused resources, adjust the design, or request a quota increase before production is affected.

## Important operational lessons

- A budget alert is an alert, not a hard spending cap.
- Use an IAM administrator role or user for day-to-day lab work; do not use the AWS root user.
- Confirm SNS subscriptions before relying on email notifications.
- Test alert delivery with a synthetic event before treating the monitoring path as operational.
- Centralize multi-account alerts in a hub account, but send notifications to the system the on-call team actually uses.

## Cleanup completed

I deleted resources in this order:

1. `quota-monitor-sq-spoke-lab` (spoke)
2. `quota-monitor-hub-lab` (hub)
3. Checked DynamoDB in `us-east-1` for a retained hub table, deleting it only if it was tagged as belonging to the hub stack.

Deleting the spoke first prevents it from continuing to send events to a hub that no longer exists.

## Next improvement: Microsoft Teams notifications

The upstream solution supports Slack as an optional notifier. A practical extension is a Teams notifier that consumes the same quota event and posts it to a Teams Workflow webhook or an enterprise incident-management system. This keeps capacity alerts in the collaboration tool used by the operating team.

That work should be implemented as a separately tested, documented infrastructure and application change before deployment.
