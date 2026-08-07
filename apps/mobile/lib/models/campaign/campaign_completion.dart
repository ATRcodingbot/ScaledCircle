import 'package:cloud_firestore/cloud_firestore.dart';

enum CampaignCompletionType { zone, location, campaign }

enum CampaignCompletionStatus {
  draft,
  inProgress,
  submitted,
  approved,
  changesRequested,
  rejected,
}

enum CompletionProofType {
  gpsRoute,
  checkpointPhoto,
  installationPhoto,
  beforePhoto,
  loadedPhoto,
  afterPhoto,
  receiptPhoto,
  eventPhoto,
  manualNote,
}

class CompletionProof {
  final String id;

  final CompletionProofType type;

  final String? fileUrl;

  final String? note;

  final String? campaignLocationId;

  final double? latitude;

  final double? longitude;

  final DateTime? capturedAt;

  const CompletionProof({
    required this.id,
    required this.type,
    this.fileUrl,
    this.note,
    this.campaignLocationId,
    this.latitude,
    this.longitude,
    this.capturedAt,
  });

  factory CompletionProof.fromMap(Map<String, dynamic> data) {
    return CompletionProof(
      id: data['id']?.toString() ?? '',
      type: _proofTypeFromString(data['type']?.toString()),
      fileUrl: data['fileUrl']?.toString(),
      note: data['note']?.toString(),
      campaignLocationId: data['campaignLocationId']?.toString(),
      latitude: (data['latitude'] as num?)?.toDouble(),
      longitude: (data['longitude'] as num?)?.toDouble(),
      capturedAt: _dateTimeFromValue(data['capturedAt']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'type': proofTypeValue(type),
      'fileUrl': fileUrl,
      'note': note,
      'campaignLocationId': campaignLocationId,
      'latitude': latitude,
      'longitude': longitude,
      if (capturedAt != null) 'capturedAt': Timestamp.fromDate(capturedAt!),
    };
  }

  bool get hasCoordinates {
    return latitude != null && longitude != null;
  }

  bool get hasPhoto {
    return fileUrl != null && fileUrl!.isNotEmpty;
  }

  static CompletionProofType _proofTypeFromString(String? value) {
    switch (value) {
      case 'checkpoint_photo':
        return CompletionProofType.checkpointPhoto;

      case 'installation_photo':
        return CompletionProofType.installationPhoto;

      case 'before_photo':
        return CompletionProofType.beforePhoto;

      case 'loaded_photo':
        return CompletionProofType.loadedPhoto;

      case 'after_photo':
        return CompletionProofType.afterPhoto;

      case 'receipt_photo':
        return CompletionProofType.receiptPhoto;

      case 'event_photo':
        return CompletionProofType.eventPhoto;

      case 'manual_note':
        return CompletionProofType.manualNote;

      case 'gps_route':
      default:
        return CompletionProofType.gpsRoute;
    }
  }

  static String proofTypeValue(CompletionProofType type) {
    switch (type) {
      case CompletionProofType.gpsRoute:
        return 'gps_route';

      case CompletionProofType.checkpointPhoto:
        return 'checkpoint_photo';

      case CompletionProofType.installationPhoto:
        return 'installation_photo';

      case CompletionProofType.beforePhoto:
        return 'before_photo';

      case CompletionProofType.loadedPhoto:
        return 'loaded_photo';

      case CompletionProofType.afterPhoto:
        return 'after_photo';

      case CompletionProofType.receiptPhoto:
        return 'receipt_photo';

      case CompletionProofType.eventPhoto:
        return 'event_photo';

      case CompletionProofType.manualNote:
        return 'manual_note';
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
}

class CampaignCompletion {
  final String id;

  final String campaignId;

  final String businessId;

  final String scalerId;

  final String? scalerEmail;

  final String? zoneId;

  final String? zoneName;

  final String? campaignLocationId;

  final CampaignCompletionType type;

  final CampaignCompletionStatus status;

  final String? routeId;

  final int gpsPointCount;

  final bool routeSimulated;

  final double? gpsCompliancePercent;

  final double? distanceMiles;

  final int? durationMinutes;

  final int completedQuantity;

  final List<CompletionProof> proofs;

  final String? scalerNotes;

  final String? businessFeedback;

  final DateTime? startedAt;

  final DateTime? submittedAt;

  final DateTime? approvedAt;

  final DateTime? changesRequestedAt;

  final DateTime? completedAt;

  final DateTime? createdAt;

  final DateTime? updatedAt;

  const CampaignCompletion({
    required this.id,
    required this.campaignId,
    required this.businessId,
    required this.scalerId,
    this.scalerEmail,
    this.zoneId,
    this.zoneName,
    this.campaignLocationId,
    required this.type,
    required this.status,
    this.routeId,
    this.gpsPointCount = 0,
    this.routeSimulated = false,
    this.gpsCompliancePercent,
    this.distanceMiles,
    this.durationMinutes,
    this.completedQuantity = 0,
    this.proofs = const [],
    this.scalerNotes,
    this.businessFeedback,
    this.startedAt,
    this.submittedAt,
    this.approvedAt,
    this.changesRequestedAt,
    this.completedAt,
    this.createdAt,
    this.updatedAt,
  });

  factory CampaignCompletion.fromDocument(
    DocumentSnapshot<Map<String, dynamic>> document,
  ) {
    final data = document.data() ?? {};

    final rawProofs = data['proofs'];

    final proofs = <CompletionProof>[];

    if (rawProofs is List) {
      for (final item in rawProofs) {
        if (item is Map) {
          proofs.add(CompletionProof.fromMap(Map<String, dynamic>.from(item)));
        }
      }
    }

    return CampaignCompletion(
      id: document.id,
      campaignId: data['campaignId']?.toString() ?? '',
      businessId: data['businessId']?.toString() ?? '',
      scalerId: data['scalerId']?.toString() ?? '',
      scalerEmail: data['scalerEmail']?.toString(),
      zoneId: data['zoneId']?.toString(),
      zoneName: data['zoneName']?.toString(),
      campaignLocationId: data['campaignLocationId']?.toString(),
      type: _completionTypeFromString(data['completionType']?.toString()),
      status: _completionStatusFromString(data['status']?.toString()),
      routeId:
          data['routeId']?.toString() ?? data['submittedRouteId']?.toString(),
      gpsPointCount:
          (data['gpsPointCount'] as num?)?.toInt() ??
          (data['submittedRoutePointCount'] as num?)?.toInt() ??
          0,
      routeSimulated:
          data['routeSimulated'] == true ||
          data['submittedRouteSimulated'] == true,
      gpsCompliancePercent: (data['gpsCompliancePercent'] as num?)?.toDouble(),
      distanceMiles: (data['distanceMiles'] as num?)?.toDouble(),
      durationMinutes: (data['durationMinutes'] as num?)?.toInt(),
      completedQuantity: (data['completedQuantity'] as num?)?.toInt() ?? 0,
      proofs: proofs,
      scalerNotes: data['scalerNotes']?.toString(),
      businessFeedback:
          data['businessFeedback']?.toString() ??
          data['reviewFeedback']?.toString(),
      startedAt: _dateTimeFromValue(data['startedAt']),
      submittedAt: _dateTimeFromValue(data['submittedAt']),
      approvedAt: _dateTimeFromValue(data['approvedAt']),
      changesRequestedAt: _dateTimeFromValue(data['changesRequestedAt']),
      completedAt: _dateTimeFromValue(data['completedAt']),
      createdAt: _dateTimeFromValue(data['createdAt']),
      updatedAt: _dateTimeFromValue(data['updatedAt']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'campaignId': campaignId,
      'businessId': businessId,
      'scalerId': scalerId,
      'scalerEmail': scalerEmail,
      'zoneId': zoneId,
      'zoneName': zoneName,
      'campaignLocationId': campaignLocationId,
      'completionType': completionTypeValue(type),
      'status': completionStatusValue(status),
      'routeId': routeId,
      'gpsPointCount': gpsPointCount,
      'routeSimulated': routeSimulated,
      'gpsCompliancePercent': gpsCompliancePercent,
      'distanceMiles': distanceMiles,
      'durationMinutes': durationMinutes,
      'completedQuantity': completedQuantity,
      'proofs': proofs.map((proof) => proof.toMap()).toList(),
      'scalerNotes': scalerNotes,
      'businessFeedback': businessFeedback,
      if (startedAt != null) 'startedAt': Timestamp.fromDate(startedAt!),
      if (submittedAt != null) 'submittedAt': Timestamp.fromDate(submittedAt!),
      if (approvedAt != null) 'approvedAt': Timestamp.fromDate(approvedAt!),
      if (changesRequestedAt != null)
        'changesRequestedAt': Timestamp.fromDate(changesRequestedAt!),
      if (completedAt != null) 'completedAt': Timestamp.fromDate(completedAt!),
      if (createdAt != null) 'createdAt': Timestamp.fromDate(createdAt!),
      if (updatedAt != null) 'updatedAt': Timestamp.fromDate(updatedAt!),
    };
  }

  CampaignCompletion copyWith({
    String? id,
    String? campaignId,
    String? businessId,
    String? scalerId,
    String? scalerEmail,
    String? zoneId,
    String? zoneName,
    String? campaignLocationId,
    CampaignCompletionType? type,
    CampaignCompletionStatus? status,
    String? routeId,
    int? gpsPointCount,
    bool? routeSimulated,
    double? gpsCompliancePercent,
    double? distanceMiles,
    int? durationMinutes,
    int? completedQuantity,
    List<CompletionProof>? proofs,
    String? scalerNotes,
    String? businessFeedback,
    DateTime? startedAt,
    DateTime? submittedAt,
    DateTime? approvedAt,
    DateTime? changesRequestedAt,
    DateTime? completedAt,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return CampaignCompletion(
      id: id ?? this.id,
      campaignId: campaignId ?? this.campaignId,
      businessId: businessId ?? this.businessId,
      scalerId: scalerId ?? this.scalerId,
      scalerEmail: scalerEmail ?? this.scalerEmail,
      zoneId: zoneId ?? this.zoneId,
      zoneName: zoneName ?? this.zoneName,
      campaignLocationId: campaignLocationId ?? this.campaignLocationId,
      type: type ?? this.type,
      status: status ?? this.status,
      routeId: routeId ?? this.routeId,
      gpsPointCount: gpsPointCount ?? this.gpsPointCount,
      routeSimulated: routeSimulated ?? this.routeSimulated,
      gpsCompliancePercent: gpsCompliancePercent ?? this.gpsCompliancePercent,
      distanceMiles: distanceMiles ?? this.distanceMiles,
      durationMinutes: durationMinutes ?? this.durationMinutes,
      completedQuantity: completedQuantity ?? this.completedQuantity,
      proofs: proofs ?? this.proofs,
      scalerNotes: scalerNotes ?? this.scalerNotes,
      businessFeedback: businessFeedback ?? this.businessFeedback,
      startedAt: startedAt ?? this.startedAt,
      submittedAt: submittedAt ?? this.submittedAt,
      approvedAt: approvedAt ?? this.approvedAt,
      changesRequestedAt: changesRequestedAt ?? this.changesRequestedAt,
      completedAt: completedAt ?? this.completedAt,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  int proofCount(CompletionProofType proofType) {
    return proofs.where((proof) => proof.type == proofType).length;
  }

  bool hasProof(CompletionProofType proofType) {
    return proofs.any((proof) => proof.type == proofType);
  }

  bool get hasGpsEvidence {
    return routeId != null && routeId!.isNotEmpty && gpsPointCount >= 2;
  }

  bool get hasPhotoEvidence {
    return proofs.any((proof) => proof.hasPhoto);
  }

  bool get awaitingBusinessReview {
    return status == CampaignCompletionStatus.submitted;
  }

  static CampaignCompletionType _completionTypeFromString(String? value) {
    switch (value) {
      case 'location':
        return CampaignCompletionType.location;

      case 'campaign':
        return CampaignCompletionType.campaign;

      case 'zone':
      default:
        return CampaignCompletionType.zone;
    }
  }

  static CampaignCompletionStatus _completionStatusFromString(String? value) {
    switch (value) {
      case 'in_progress':
        return CampaignCompletionStatus.inProgress;

      case 'submitted':
        return CampaignCompletionStatus.submitted;

      case 'approved':
      case 'completed':
        return CampaignCompletionStatus.approved;

      case 'changes_requested':
        return CampaignCompletionStatus.changesRequested;

      case 'rejected':
        return CampaignCompletionStatus.rejected;

      case 'draft':
      default:
        return CampaignCompletionStatus.draft;
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

  static String completionTypeValue(CampaignCompletionType type) {
    switch (type) {
      case CampaignCompletionType.zone:
        return 'zone';

      case CampaignCompletionType.location:
        return 'location';

      case CampaignCompletionType.campaign:
        return 'campaign';
    }
  }

  static String completionStatusValue(CampaignCompletionStatus status) {
    switch (status) {
      case CampaignCompletionStatus.draft:
        return 'draft';

      case CampaignCompletionStatus.inProgress:
        return 'in_progress';

      case CampaignCompletionStatus.submitted:
        return 'submitted';

      case CampaignCompletionStatus.approved:
        return 'approved';

      case CampaignCompletionStatus.changesRequested:
        return 'changes_requested';

      case CampaignCompletionStatus.rejected:
        return 'rejected';
    }
  }
}
