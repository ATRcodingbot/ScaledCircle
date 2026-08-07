import 'package:cloud_firestore/cloud_firestore.dart';

enum CampaignLocationType {
  servicePoint,
  yardSignInstallation,
  materialPickup,
  materialDropoff,
  dumpPickup,
  dumpDropoff,
  eventLocation,
}

enum CampaignLocationStatus {
  pending,
  assigned,
  inProgress,
  completed,
  skipped,
  cancelled,
}

class CampaignLocation {
  final String id;

  final String campaignId;

  final CampaignLocationType type;

  final CampaignLocationStatus status;

  final String? address;

  final double latitude;

  final double longitude;

  final String? instructions;

  final int quantity;

  final String? assignedScalerId;

  final String? assignedScalerEmail;

  final DateTime? scheduledAt;

  final DateTime? windowStart;

  final DateTime? windowEnd;

  final DateTime? completedAt;

  final DateTime? createdAt;

  final DateTime? updatedAt;

  const CampaignLocation({
    required this.id,
    required this.campaignId,
    required this.type,
    required this.status,
    this.address,
    required this.latitude,
    required this.longitude,
    this.instructions,
    this.quantity = 1,
    this.assignedScalerId,
    this.assignedScalerEmail,
    this.scheduledAt,
    this.windowStart,
    this.windowEnd,
    this.completedAt,
    this.createdAt,
    this.updatedAt,
  });

  factory CampaignLocation.fromDocument(
    DocumentSnapshot<Map<String, dynamic>> document,
  ) {
    final data = document.data() ?? {};

    return CampaignLocation(
      id: document.id,
      campaignId: data['campaignId']?.toString() ?? '',
      type: _locationTypeFromString(data['locationType']?.toString()),
      status: _locationStatusFromString(data['status']?.toString()),
      address: data['address']?.toString(),
      latitude:
          (data['latitude'] as num?)?.toDouble() ??
          (data['location'] is GeoPoint
              ? (data['location'] as GeoPoint).latitude
              : 0.0),
      longitude:
          (data['longitude'] as num?)?.toDouble() ??
          (data['location'] is GeoPoint
              ? (data['location'] as GeoPoint).longitude
              : 0.0),
      instructions: data['instructions']?.toString(),
      quantity: (data['quantity'] as num?)?.toInt() ?? 1,
      assignedScalerId: data['assignedScalerId']?.toString(),
      assignedScalerEmail: data['assignedScalerEmail']?.toString(),
      scheduledAt: _dateTimeFromValue(data['scheduledAt']),
      windowStart: _dateTimeFromValue(data['windowStart']),
      windowEnd: _dateTimeFromValue(data['windowEnd']),
      completedAt: _dateTimeFromValue(data['completedAt']),
      createdAt: _dateTimeFromValue(data['createdAt']),
      updatedAt: _dateTimeFromValue(data['updatedAt']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'campaignId': campaignId,
      'locationType': locationTypeValue(type),
      'status': locationStatusValue(status),
      'address': address,
      'latitude': latitude,
      'longitude': longitude,
      'location': GeoPoint(latitude, longitude),
      'instructions': instructions,
      'quantity': quantity,
      'assignedScalerId': assignedScalerId,
      'assignedScalerEmail': assignedScalerEmail,
      if (scheduledAt != null) 'scheduledAt': Timestamp.fromDate(scheduledAt!),
      if (windowStart != null) 'windowStart': Timestamp.fromDate(windowStart!),
      if (windowEnd != null) 'windowEnd': Timestamp.fromDate(windowEnd!),
      if (completedAt != null) 'completedAt': Timestamp.fromDate(completedAt!),
      if (createdAt != null) 'createdAt': Timestamp.fromDate(createdAt!),
      if (updatedAt != null) 'updatedAt': Timestamp.fromDate(updatedAt!),
    };
  }

  CampaignLocation copyWith({
    String? id,
    String? campaignId,
    CampaignLocationType? type,
    CampaignLocationStatus? status,
    String? address,
    double? latitude,
    double? longitude,
    String? instructions,
    int? quantity,
    String? assignedScalerId,
    String? assignedScalerEmail,
    DateTime? scheduledAt,
    DateTime? windowStart,
    DateTime? windowEnd,
    DateTime? completedAt,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return CampaignLocation(
      id: id ?? this.id,
      campaignId: campaignId ?? this.campaignId,
      type: type ?? this.type,
      status: status ?? this.status,
      address: address ?? this.address,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      instructions: instructions ?? this.instructions,
      quantity: quantity ?? this.quantity,
      assignedScalerId: assignedScalerId ?? this.assignedScalerId,
      assignedScalerEmail: assignedScalerEmail ?? this.assignedScalerEmail,
      scheduledAt: scheduledAt ?? this.scheduledAt,
      windowStart: windowStart ?? this.windowStart,
      windowEnd: windowEnd ?? this.windowEnd,
      completedAt: completedAt ?? this.completedAt,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  bool get hasValidCoordinates {
    return latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180 &&
        !(latitude == 0 && longitude == 0);
  }

  bool get requiresExactLocation {
    return type == CampaignLocationType.yardSignInstallation ||
        type == CampaignLocationType.materialPickup ||
        type == CampaignLocationType.materialDropoff ||
        type == CampaignLocationType.dumpPickup ||
        type == CampaignLocationType.dumpDropoff ||
        type == CampaignLocationType.eventLocation;
  }

  static CampaignLocationType _locationTypeFromString(String? value) {
    switch (value) {
      case 'yard_sign_installation':
        return CampaignLocationType.yardSignInstallation;

      case 'material_pickup':
        return CampaignLocationType.materialPickup;

      case 'material_dropoff':
        return CampaignLocationType.materialDropoff;

      case 'dump_pickup':
        return CampaignLocationType.dumpPickup;

      case 'dump_dropoff':
        return CampaignLocationType.dumpDropoff;

      case 'event_location':
        return CampaignLocationType.eventLocation;

      case 'service_point':
      default:
        return CampaignLocationType.servicePoint;
    }
  }

  static CampaignLocationStatus _locationStatusFromString(String? value) {
    switch (value) {
      case 'assigned':
        return CampaignLocationStatus.assigned;

      case 'in_progress':
        return CampaignLocationStatus.inProgress;

      case 'completed':
        return CampaignLocationStatus.completed;

      case 'skipped':
        return CampaignLocationStatus.skipped;

      case 'cancelled':
      case 'canceled':
        return CampaignLocationStatus.cancelled;

      case 'pending':
      default:
        return CampaignLocationStatus.pending;
    }
  }

  static DateTime? _dateTimeFromValue(dynamic value) {
    if (value is Timestamp) {
      return value.toDate();
    }

    if (value is DateTime) {
      return value;
    }

    return null;
  }

  static String locationTypeValue(CampaignLocationType type) {
    switch (type) {
      case CampaignLocationType.servicePoint:
        return 'service_point';

      case CampaignLocationType.yardSignInstallation:
        return 'yard_sign_installation';

      case CampaignLocationType.materialPickup:
        return 'material_pickup';

      case CampaignLocationType.materialDropoff:
        return 'material_dropoff';

      case CampaignLocationType.dumpPickup:
        return 'dump_pickup';

      case CampaignLocationType.dumpDropoff:
        return 'dump_dropoff';

      case CampaignLocationType.eventLocation:
        return 'event_location';
    }
  }

  static String locationStatusValue(CampaignLocationStatus status) {
    switch (status) {
      case CampaignLocationStatus.pending:
        return 'pending';

      case CampaignLocationStatus.assigned:
        return 'assigned';

      case CampaignLocationStatus.inProgress:
        return 'in_progress';

      case CampaignLocationStatus.completed:
        return 'completed';

      case CampaignLocationStatus.skipped:
        return 'skipped';

      case CampaignLocationStatus.cancelled:
        return 'cancelled';
    }
  }
}
