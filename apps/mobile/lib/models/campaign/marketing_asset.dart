import 'package:cloud_firestore/cloud_firestore.dart';

enum MarketingAssetType {
  flyer,
  doorHanger,
  businessCard,
  yardSign,
  postcard,
  qrCode,
  landingPage,
  trackingPhone,
  trackingEmail,
}

enum MarketingAssetSource {
  businessProvided,
  scaledCircleGenerated,
  printedByScaledCircle,
}

enum MarketingAssetStatus { draft, ready, active, archived }

class MarketingAsset {
  final String id;

  final String campaignId;

  final String businessId;

  final MarketingAssetType type;

  final MarketingAssetSource source;

  final MarketingAssetStatus status;

  final String name;

  final String? description;

  final String? fileUrl;

  final String? previewUrl;

  final String? qrCodeUrl;

  final String? trackingUrl;

  final String? trackingPhoneNumber;

  final String? forwardingPhoneNumber;

  final String? trackingEmailAddress;

  final String? forwardingEmailAddress;

  final String? landingPageUrl;

  final int scanCount;

  final int visitCount;

  final int callCount;

  final int emailCount;

  final int leadCount;

  final int quantity;

  final DateTime? createdAt;

  final DateTime? updatedAt;

  const MarketingAsset({
    required this.id,
    required this.campaignId,
    required this.businessId,
    required this.type,
    required this.source,
    required this.status,
    required this.name,
    this.description,
    this.fileUrl,
    this.previewUrl,
    this.qrCodeUrl,
    this.trackingUrl,
    this.trackingPhoneNumber,
    this.forwardingPhoneNumber,
    this.trackingEmailAddress,
    this.forwardingEmailAddress,
    this.landingPageUrl,
    this.scanCount = 0,
    this.visitCount = 0,
    this.callCount = 0,
    this.emailCount = 0,
    this.leadCount = 0,
    this.quantity = 1,
    this.createdAt,
    this.updatedAt,
  });

  factory MarketingAsset.fromDocument(
    DocumentSnapshot<Map<String, dynamic>> document,
  ) {
    final data = document.data() ?? {};

    return MarketingAsset(
      id: document.id,
      campaignId: data['campaignId']?.toString() ?? '',
      businessId: data['businessId']?.toString() ?? '',
      type: _assetTypeFromString(data['assetType']?.toString()),
      source: _assetSourceFromString(data['source']?.toString()),
      status: _assetStatusFromString(data['status']?.toString()),
      name: data['name']?.toString() ?? 'Marketing Asset',
      description: data['description']?.toString(),
      fileUrl: data['fileUrl']?.toString(),
      previewUrl: data['previewUrl']?.toString(),
      qrCodeUrl: data['qrCodeUrl']?.toString(),
      trackingUrl: data['trackingUrl']?.toString(),
      trackingPhoneNumber: data['trackingPhoneNumber']?.toString(),
      forwardingPhoneNumber: data['forwardingPhoneNumber']?.toString(),
      trackingEmailAddress: data['trackingEmailAddress']?.toString(),
      forwardingEmailAddress: data['forwardingEmailAddress']?.toString(),
      landingPageUrl: data['landingPageUrl']?.toString(),
      scanCount: (data['scanCount'] as num?)?.toInt() ?? 0,
      visitCount: (data['visitCount'] as num?)?.toInt() ?? 0,
      callCount: (data['callCount'] as num?)?.toInt() ?? 0,
      emailCount: (data['emailCount'] as num?)?.toInt() ?? 0,
      leadCount: (data['leadCount'] as num?)?.toInt() ?? 0,
      quantity: (data['quantity'] as num?)?.toInt() ?? 1,
      createdAt: _dateTimeFromValue(data['createdAt']),
      updatedAt: _dateTimeFromValue(data['updatedAt']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'campaignId': campaignId,
      'businessId': businessId,
      'assetType': assetTypeValue(type),
      'source': assetSourceValue(source),
      'status': assetStatusValue(status),
      'name': name,
      'description': description,
      'fileUrl': fileUrl,
      'previewUrl': previewUrl,
      'qrCodeUrl': qrCodeUrl,
      'trackingUrl': trackingUrl,
      'trackingPhoneNumber': trackingPhoneNumber,
      'forwardingPhoneNumber': forwardingPhoneNumber,
      'trackingEmailAddress': trackingEmailAddress,
      'forwardingEmailAddress': forwardingEmailAddress,
      'landingPageUrl': landingPageUrl,
      'scanCount': scanCount,
      'visitCount': visitCount,
      'callCount': callCount,
      'emailCount': emailCount,
      'leadCount': leadCount,
      'quantity': quantity,
      if (createdAt != null) 'createdAt': Timestamp.fromDate(createdAt!),
      if (updatedAt != null) 'updatedAt': Timestamp.fromDate(updatedAt!),
    };
  }

  MarketingAsset copyWith({
    String? id,
    String? campaignId,
    String? businessId,
    MarketingAssetType? type,
    MarketingAssetSource? source,
    MarketingAssetStatus? status,
    String? name,
    String? description,
    String? fileUrl,
    String? previewUrl,
    String? qrCodeUrl,
    String? trackingUrl,
    String? trackingPhoneNumber,
    String? forwardingPhoneNumber,
    String? trackingEmailAddress,
    String? forwardingEmailAddress,
    String? landingPageUrl,
    int? scanCount,
    int? visitCount,
    int? callCount,
    int? emailCount,
    int? leadCount,
    int? quantity,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return MarketingAsset(
      id: id ?? this.id,
      campaignId: campaignId ?? this.campaignId,
      businessId: businessId ?? this.businessId,
      type: type ?? this.type,
      source: source ?? this.source,
      status: status ?? this.status,
      name: name ?? this.name,
      description: description ?? this.description,
      fileUrl: fileUrl ?? this.fileUrl,
      previewUrl: previewUrl ?? this.previewUrl,
      qrCodeUrl: qrCodeUrl ?? this.qrCodeUrl,
      trackingUrl: trackingUrl ?? this.trackingUrl,
      trackingPhoneNumber: trackingPhoneNumber ?? this.trackingPhoneNumber,
      forwardingPhoneNumber:
          forwardingPhoneNumber ?? this.forwardingPhoneNumber,
      trackingEmailAddress: trackingEmailAddress ?? this.trackingEmailAddress,
      forwardingEmailAddress:
          forwardingEmailAddress ?? this.forwardingEmailAddress,
      landingPageUrl: landingPageUrl ?? this.landingPageUrl,
      scanCount: scanCount ?? this.scanCount,
      visitCount: visitCount ?? this.visitCount,
      callCount: callCount ?? this.callCount,
      emailCount: emailCount ?? this.emailCount,
      leadCount: leadCount ?? this.leadCount,
      quantity: quantity ?? this.quantity,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  int get totalTrackedInteractions {
    return scanCount + visitCount + callCount + emailCount;
  }

  bool get hasTracking {
    return trackingUrl != null ||
        trackingPhoneNumber != null ||
        trackingEmailAddress != null ||
        landingPageUrl != null ||
        qrCodeUrl != null;
  }

  bool get isPhysicalAsset {
    return type == MarketingAssetType.flyer ||
        type == MarketingAssetType.doorHanger ||
        type == MarketingAssetType.businessCard ||
        type == MarketingAssetType.yardSign ||
        type == MarketingAssetType.postcard;
  }

  bool get isTrackingAsset {
    return type == MarketingAssetType.qrCode ||
        type == MarketingAssetType.landingPage ||
        type == MarketingAssetType.trackingPhone ||
        type == MarketingAssetType.trackingEmail;
  }

  static MarketingAssetType _assetTypeFromString(String? value) {
    switch (value) {
      case 'door_hanger':
        return MarketingAssetType.doorHanger;

      case 'business_card':
        return MarketingAssetType.businessCard;

      case 'yard_sign':
        return MarketingAssetType.yardSign;

      case 'postcard':
        return MarketingAssetType.postcard;

      case 'qr_code':
        return MarketingAssetType.qrCode;

      case 'landing_page':
        return MarketingAssetType.landingPage;

      case 'tracking_phone':
        return MarketingAssetType.trackingPhone;

      case 'tracking_email':
        return MarketingAssetType.trackingEmail;

      case 'flyer':
      default:
        return MarketingAssetType.flyer;
    }
  }

  static MarketingAssetSource _assetSourceFromString(String? value) {
    switch (value) {
      case 'scaled_circle_generated':
        return MarketingAssetSource.scaledCircleGenerated;

      case 'printed_by_scaled_circle':
        return MarketingAssetSource.printedByScaledCircle;

      case 'business_provided':
      default:
        return MarketingAssetSource.businessProvided;
    }
  }

  static MarketingAssetStatus _assetStatusFromString(String? value) {
    switch (value) {
      case 'ready':
        return MarketingAssetStatus.ready;

      case 'active':
        return MarketingAssetStatus.active;

      case 'archived':
        return MarketingAssetStatus.archived;

      case 'draft':
      default:
        return MarketingAssetStatus.draft;
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

  static String assetTypeValue(MarketingAssetType type) {
    switch (type) {
      case MarketingAssetType.flyer:
        return 'flyer';

      case MarketingAssetType.doorHanger:
        return 'door_hanger';

      case MarketingAssetType.businessCard:
        return 'business_card';

      case MarketingAssetType.yardSign:
        return 'yard_sign';

      case MarketingAssetType.postcard:
        return 'postcard';

      case MarketingAssetType.qrCode:
        return 'qr_code';

      case MarketingAssetType.landingPage:
        return 'landing_page';

      case MarketingAssetType.trackingPhone:
        return 'tracking_phone';

      case MarketingAssetType.trackingEmail:
        return 'tracking_email';
    }
  }

  static String assetSourceValue(MarketingAssetSource source) {
    switch (source) {
      case MarketingAssetSource.businessProvided:
        return 'business_provided';

      case MarketingAssetSource.scaledCircleGenerated:
        return 'scaled_circle_generated';

      case MarketingAssetSource.printedByScaledCircle:
        return 'printed_by_scaled_circle';
    }
  }

  static String assetStatusValue(MarketingAssetStatus status) {
    switch (status) {
      case MarketingAssetStatus.draft:
        return 'draft';

      case MarketingAssetStatus.ready:
        return 'ready';

      case MarketingAssetStatus.active:
        return 'active';

      case MarketingAssetStatus.archived:
        return 'archived';
    }
  }
}
