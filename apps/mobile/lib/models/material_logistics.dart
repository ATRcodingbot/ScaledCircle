class MaterialLogisticsDraft {
  const MaterialLogisticsDraft({
    this.fulfillmentType = noMaterialsRequired,
    this.location = '',
    this.printingShopName = '',
    this.orderReference = '',
    this.instructions = '',
    this.scheduledAt,
    this.windowEndAt,
    this.latitude,
    this.longitude,
  });

  static const scalerPickupPrintShop = 'scaler_pickup_print_shop';
  static const scalerPickupBusiness = 'scaler_pickup_business';
  static const businessDelivery = 'business_delivery';
  static const noMaterialsRequired = 'no_materials_required';
  static const supportedTypes = <String>[
    scalerPickupPrintShop,
    scalerPickupBusiness,
    businessDelivery,
    noMaterialsRequired,
  ];

  final String fulfillmentType;
  final String location;
  final String printingShopName;
  final String orderReference;
  final String instructions;
  final DateTime? scheduledAt;
  final DateTime? windowEndAt;
  final double? latitude;
  final double? longitude;

  bool get materialsRequired => fulfillmentType != noMaterialsRequired;

  String? validate() {
    if (!supportedTypes.contains(fulfillmentType)) {
      return 'Choose a supported material fulfillment method.';
    }
    if (!materialsRequired) return null;
    if (scheduledAt == null) {
      return 'Choose the pickup or delivery date and time.';
    }
    if (location.trim().isEmpty) {
      return 'Enter the pickup or delivery location.';
    }
    if (fulfillmentType == scalerPickupPrintShop &&
        printingShopName.trim().isEmpty) {
      return 'Enter the printing shop name.';
    }
    if (windowEndAt != null && windowEndAt!.isBefore(scheduledAt!)) {
      return 'The logistics window must end after it begins.';
    }
    return null;
  }

  factory MaterialLogisticsDraft.fromCampaign(Map<String, dynamic> data) {
    final raw = (data['materialFulfillmentType'] ??
            data['materialHandoffMethod'] ??
            noMaterialsRequired)
        .toString();
    final normalized = switch (raw) {
      'third_party_pickup' => scalerPickupPrintShop,
      'business_pickup' => scalerPickupBusiness,
      'business_dropoff' => businessDelivery,
      _ when supportedTypes.contains(raw) => raw,
      _ => noMaterialsRequired,
    };
    return MaterialLogisticsDraft(
      fulfillmentType: normalized,
      location: data['materialHandoffAddress']?.toString() ?? '',
      printingShopName:
          data['materialHandoffPrintingShopName']?.toString() ?? '',
      orderReference: data['materialHandoffOrderReference']?.toString() ?? '',
      instructions: data['materialHandoffInstructions']?.toString() ?? '',
      scheduledAt: _readDate(data['materialHandoffScheduledAt']),
      windowEndAt: _readDate(data['materialHandoffWindowEndAt']),
      latitude: (data['materialHandoffLatitude'] as num?)?.toDouble(),
      longitude: (data['materialHandoffLongitude'] as num?)?.toDouble(),
    );
  }

  MaterialLogisticsDraft copyWith({
    String? fulfillmentType,
    String? location,
    String? printingShopName,
    String? orderReference,
    String? instructions,
    DateTime? scheduledAt,
    DateTime? windowEndAt,
    double? latitude,
    double? longitude,
    bool clearSchedule = false,
    bool clearWindowEnd = false,
    bool clearCoordinates = false,
  }) {
    return MaterialLogisticsDraft(
      fulfillmentType: fulfillmentType ?? this.fulfillmentType,
      location: location ?? this.location,
      printingShopName: printingShopName ?? this.printingShopName,
      orderReference: orderReference ?? this.orderReference,
      instructions: instructions ?? this.instructions,
      scheduledAt: clearSchedule ? null : scheduledAt ?? this.scheduledAt,
      windowEndAt: clearWindowEnd ? null : windowEndAt ?? this.windowEndAt,
      latitude: clearCoordinates ? null : latitude ?? this.latitude,
      longitude: clearCoordinates ? null : longitude ?? this.longitude,
    );
  }

  Map<String, dynamic> toCallableData({String? campaignId}) => {
    'campaignId': ?campaignId,
    'fulfillmentType': fulfillmentType,
    'scheduledAt': materialsRequired ? scheduledAt?.toIso8601String() : null,
    'windowEndAt': materialsRequired ? windowEndAt?.toIso8601String() : null,
    'location': materialsRequired ? location.trim() : '',
    'printingShopName': fulfillmentType == scalerPickupPrintShop
        ? printingShopName.trim()
        : '',
    'orderReference': materialsRequired ? orderReference.trim() : '',
    'instructions': materialsRequired ? instructions.trim() : '',
    'latitude': materialsRequired ? latitude : null,
    'longitude': materialsRequired ? longitude : null,
  };

  static DateTime? _readDate(dynamic value) {
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    try {
      final dynamic converted = value?.toDate();
      return converted is DateTime ? converted : null;
    } catch (_) {
      return null;
    }
  }
}
