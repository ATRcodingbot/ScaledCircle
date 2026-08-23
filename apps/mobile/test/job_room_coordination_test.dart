import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/screens/jobs/job_room_screen.dart';

void main() {
  final source = File(
    'lib/screens/jobs/job_room_screen.dart',
  ).readAsStringSync();

  test('Job Room exposes group chat and Scaler readiness', () {
    final service = File(
      'lib/services/job_room_service.dart',
    ).readAsStringSync();
    expect(source, contains("'Group Chat'"));
    expect(source, contains("'Confirm Ready'"));
    expect(source, contains("'Ready Confirmed'"));
    expect(service, contains('acknowledgeJobReadiness'));
    expect(source, contains("_formatDate(logistics['scheduledAt'])"));
    expect(source, isNot(contains("Date/time: \${logistics['scheduledAt']}")));
  });

  test('readiness cannot forge operational evidence', () {
    expect(source, contains('This is not attendance or proof of work.'));
    expect(source, contains('does not record GPS attendance'));
    expect(source, isNot(contains('confirmZoneGroupParticipantNoShow')));
    expect(source, isNot(contains('submitZoneGroupCompletion')));
    expect(source, contains('does not record GPS attendance'));
  });

  test('materials retain individual handoff authority', () {
    expect(
      source,
      contains('Shared logistics never completes another participant'),
    );
    expect(source, isNot(contains("'materialHandoffStatus':")));
  });

  test('Business selects one authoritative material logistics method', () {
    expect(source, contains('scaler_pickup_print_shop'));
    expect(source, contains('scaler_pickup_business'));
    expect(source, contains('business_delivery'));
    expect(source, contains('no_materials_required'));
    expect(source, contains('Printing Shop Pickup'));
    expect(source, contains('Business Pickup'));
    expect(source, contains('Business Delivery'));
    expect(source, isNot(contains('Meetup required')));
  });

  test(
    'Job Room exposes the current material plan without forging receipt',
    () {
      expect(source, contains("'MATERIALS'"));
      expect(source, contains('Your materials:'));
      expect(
        source,
        contains('Shared logistics never completes another participant'),
      );
      expect(source, contains('Confirm Materials Received'));
      expect(source, contains('Report Material Issue'));
      expect(source, isNot(contains("'status': 'received'")));
    },
  );

  test('material receipt actions follow fulfillment and terminal state', () {
    for (final type in [
      'business_delivery',
      'scaler_pickup_print_shop',
      'scaler_pickup_business',
    ]) {
      expect(
        materialReceiptActionVisible(
          materialsRequired: true,
          status: 'scheduled',
        ),
        isTrue,
        reason: type,
      );
    }
    expect(
      materialReceiptActionVisible(
        materialsRequired: false,
        status: 'not_required',
      ),
      isFalse,
    );
    expect(
      materialReceiptActionVisible(materialsRequired: true, status: 'received'),
      isFalse,
    );
  });

  test('receipt and issue actions use existing authoritative services', () {
    final service = File(
      'lib/services/job_room_service.dart',
    ).readAsStringSync();
    expect(service, contains("httpsCallable('transitionMaterialHandoff')"));
    expect(service, contains("httpsCallable('createSupportCase')"));
    expect(service, contains("'category': 'material_handoff'"));
    expect(service, contains("nextStatus: 'received'"));
    expect(service, isNot(contains('Geolocator')));
    expect(service, isNot(contains('getCurrentPosition')));
    expect(service, isNot(contains('LocationPermission')));
    expect(service, isNot(contains('ImagePicker')));
    expect(service, isNot(contains('FirebaseStorage')));
    expect(source, isNot(contains('current handoff location')));
    expect(source, contains('does not request location'));
    expect(source, contains('Ready Confirmed'));
    expect(source, contains('does not record attendance'));
  });

  test('Job Room presents independent Business and Scaler confirmations', () {
    expect(source, contains('Business confirmation:'));
    expect(source, contains('Your confirmation:'));
    expect(source, contains('Confirm Delivered'));
    expect(source, contains('Confirm Released'));
    expect(source, contains('Confirm Pickup'));
    expect(source, contains('Awaiting the Business confirmation.'));
  });

  test('group participants see the assigned zone in Current Campaigns', () {
    final jobsSource = File(
      'lib/screens/jobs/my_jobs_screen.dart',
    ).readAsStringSync();
    final backendSource = File('../../functions/index.js').readAsStringSync();
    expect(
      jobsSource,
      contains("Filter('assignedScalerIds', arrayContains: user.uid)"),
    );
    expect(jobsSource, contains('AppRoutes.jobRoom(zone.id)'));
    expect(
      backendSource,
      contains('assignedScalerIds: FieldValue.arrayUnion(scalerUid)'),
    );
  });

  test('locked logistics use participant-specific proposal consent', () {
    final service = File(
      'lib/services/job_room_service.dart',
    ).readAsStringSync();
    expect(source, contains('PROPOSED LOGISTICS CHANGE'));
    expect(source, contains('Accept Change'));
    expect(source, contains('Decline'));
    expect(source, contains('cannot be overwritten after assignment'));
    expect(service, contains('respondToMaterialLogisticsChange'));
    expect(source, contains('Readiness does not record GPS attendance'));
  });

  test(
    'material status language follows the authoritative fulfillment method',
    () {
      expect(
        materialHandoffStatusLabel(
          status: 'scheduled',
          fulfillmentType: 'business_delivery',
          materialsRequired: true,
        ),
        'Awaiting delivery',
      );
      for (final type in [
        'scaler_pickup_print_shop',
        'scaler_pickup_business',
      ]) {
        expect(
          materialHandoffStatusLabel(
            status: 'scheduled',
            fulfillmentType: type,
            materialsRequired: true,
          ),
          'Awaiting pickup',
        );
      }
      expect(
        materialHandoffStatusLabel(
          status: 'not_required',
          fulfillmentType: 'no_materials_required',
          materialsRequired: false,
        ),
        'No materials required',
      );
      expect(
        materialHandoffStatusLabel(
          status: 'received',
          fulfillmentType: 'business_delivery',
          materialsRequired: true,
        ),
        'Received',
      );
      expect(
        materialHandoffStatusLabel(
          status: 'handoff_in_progress',
          fulfillmentType: 'business_delivery',
          materialsRequired: true,
        ),
        'Awaiting confirmations',
      );
    },
  );

  test(
    'Business Delivery never projects an unresolved required handoff as not required',
    () {
      expect(
        materialHandoffStatusLabel(
          status: 'not_required',
          fulfillmentType: 'business_delivery',
          materialsRequired: true,
        ),
        'Awaiting delivery',
      );
      expect(source, contains("data['viewerReadiness']"));
      expect(source, contains('await _load()'));
      expect(source, contains('_acknowledgingReadiness'));
      expect(source, contains('? null'));
    },
  );
}
