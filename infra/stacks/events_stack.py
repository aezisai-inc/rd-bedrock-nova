"""
Events Stack

EventBridge:
- Event Bus
- Event Rules
- Archive
"""
from aws_cdk import (
    NestedStack,
    Duration,
    aws_events as events,
    aws_sqs as sqs,
    aws_sns as sns,
)
from constructs import Construct


class EventsStack(NestedStack):
    """EventBridge リソースを管理するスタック。"""

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # =================================================================
        # Event Bus
        # =================================================================

        self.event_bus = events.EventBus(
            self, 'NovaEventBus',
            event_bus_name='nova-events',
        )

        # =================================================================
        # Dead Letter Queue
        # =================================================================

        self.dlq = sqs.Queue(
            self, 'DeadLetterQueue',
            queue_name='nova-events-dlq',
            retention_period=Duration.days(14),
        )

        # =================================================================
        # Alert Topic
        # =================================================================

        self.alert_topic = sns.Topic(
            self, 'AlertTopic',
            topic_name='nova-alerts',
            display_name='Nova Platform Alerts',
        )

        # =================================================================
        # Event Rules
        # =================================================================

        # Anomaly Detected (HIGH/CRITICAL) → Alert
        events.Rule(
            self, 'AnomalyAlertRule',
            event_bus=self.event_bus,
            rule_name='nova-anomaly-alert',
            event_pattern=events.EventPattern(
                source=['nova.video-service'],
                detail_type=['AnomalyDetected'],
                detail={
                    'severity': ['HIGH', 'CRITICAL'],
                },
            ),
            targets=[events.targets.SnsTopic(self.alert_topic)],
        )

        # =================================================================
        # Archive (Event Replay)
        # =================================================================

        events.Archive(
            self, 'NovaEventArchive',
            source_event_bus=self.event_bus,
            archive_name='nova-events-archive',
            retention=Duration.days(90),
            event_pattern=events.EventPattern(
                source=events.Match.prefix('nova.'),
            ),
        )
