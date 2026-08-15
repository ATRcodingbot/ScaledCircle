import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/services/subscription_plan_service.dart';

void main() {
  group('Weather Intelligence entitlement', () {
    final plans = SubscriptionPlanService();

    test('is excluded from Starter and Growth', () {
      expect(
        plans.hasFeature(plan: 'starter', feature: 'weather_intelligence'),
        isFalse,
      );
      expect(
        plans.hasFeature(plan: 'growth', feature: 'weather_intelligence'),
        isFalse,
      );
    });

    test('is included with Scale', () {
      expect(
        plans.hasFeature(plan: 'scale', feature: 'weather_intelligence'),
        isTrue,
      );
    });

    test(
      'is inherited by active paid, internal beta, and internal QA Managed Growth projections',
      () {
        final future = Timestamp.fromDate(
          DateTime.now().add(const Duration(days: 1)),
        );
        for (final source in ['stripe', 'internal_beta', 'internal_qa']) {
          expect(
            plans.hasActiveScaleEntitlement({
              'subscriptionPlan': 'managed_growth',
              'subscriptionStatus': 'active',
              'subscriptionExpiresAt': future,
              'subscriptionSource': source,
            }),
            isTrue,
          );
        }
        expect(
          plans.hasActiveScaleEntitlement({
            'subscriptionPlan': 'growth',
            'subscriptionStatus': 'active',
            'subscriptionExpiresAt': future,
          }),
          isFalse,
        );
      },
    );
  });

  group('Property Intelligence Scale entitlement', () {
    final plans = SubscriptionPlanService();
    final now = DateTime.utc(2026, 8, 13, 12);
    Map<String, dynamic> wallet({
      String plan = 'scale',
      String status = 'active',
      DateTime? expiration,
    }) => {
      'subscriptionPlan': plan,
      'subscriptionStatus': status,
      'subscriptionExpiresAt': Timestamp.fromDate(
        expiration ?? DateTime.utc(2026, 9, 13, 12),
      ),
    };

    test('is a Scale-only plan feature', () {
      expect(
        plans.hasFeature(plan: 'starter', feature: 'property_intelligence'),
        isFalse,
      );
      expect(
        plans.hasFeature(plan: 'growth', feature: 'property_intelligence'),
        isFalse,
      );
      expect(
        plans.hasFeature(plan: 'scale', feature: 'property_intelligence'),
        isTrue,
      );
    });

    test('active Scale projection renders entitled state', () {
      expect(
        plans.hasActiveScalePropertyIntelligence(wallet(), now: now),
        isTrue,
      );
    });

    test(
      'non-Scale, expired, cancelled, and inactive projections remain locked',
      () {
        expect(
          plans.hasActiveScalePropertyIntelligence(
            wallet(plan: 'growth'),
            now: now,
          ),
          isFalse,
        );
        expect(
          plans.hasActiveScalePropertyIntelligence(
            wallet(expiration: DateTime.utc(2026, 8, 13, 11)),
            now: now,
          ),
          isFalse,
        );
        expect(
          plans.hasActiveScalePropertyIntelligence(
            wallet(status: 'cancelled'),
            now: now,
          ),
          isFalse,
        );
        expect(
          plans.hasActiveScalePropertyIntelligence(
            wallet(status: 'inactive'),
            now: now,
          ),
          isFalse,
        );
      },
    );

    test(
      'active Managed Growth beta inherits Scale while expired or revoked projections lock',
      () {
        expect(
          plans.hasActiveScalePropertyIntelligence(
            wallet(plan: 'managed_growth'),
            now: now,
          ),
          isTrue,
        );
        expect(
          plans.hasActiveManagedGrowth(
            wallet(plan: 'managed_growth'),
            now: now,
          ),
          isTrue,
        );
        expect(
          plans.hasActiveManagedGrowth(
            wallet(
              plan: 'managed_growth',
              expiration: DateTime.utc(2026, 8, 13, 11),
            ),
            now: now,
          ),
          isFalse,
        );
        expect(
          plans.hasActiveManagedGrowth(
            wallet(plan: 'managed_growth', status: 'revoked'),
            now: now,
          ),
          isFalse,
        );
      },
    );
  });
}
