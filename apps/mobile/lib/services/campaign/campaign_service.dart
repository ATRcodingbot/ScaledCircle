import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/campaign/campaign.dart';
import '../../models/campaign/campaign_completion.dart';
import '../../models/campaign/campaign_location.dart';
import '../../models/campaign/marketing_asset.dart';
import '../secure_function_service.dart';

class CampaignService {
  CampaignService({FirebaseFirestore? firestore})
    : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;
  final SecureFunctionService _secureFunctions = const SecureFunctionService();

  CollectionReference<Map<String, dynamic>> get _campaigns =>
      _firestore.collection('campaigns');

  CollectionReference<Map<String, dynamic>> get _campaignLocations =>
      _firestore.collection('campaignLocations');

  CollectionReference<Map<String, dynamic>> get _marketingAssets =>
      _firestore.collection('marketingAssets');

  CollectionReference<Map<String, dynamic>> get _campaignCompletions =>
      _firestore.collection('campaignCompletions');

  // ------------------------------------------------------------
  // CAMPAIGNS
  // ------------------------------------------------------------

  Future<String> createCampaign({required Campaign campaign}) async {
    final exists = await campaignExists(
      businessId: campaign.businessId,
      campaignName: campaign.campaignName,
    );

    if (exists) {
      throw Exception('A campaign with this name already exists.');
    }

    final document = campaign.id.isNotEmpty
        ? _campaigns.doc(campaign.id)
        : _campaigns.doc();

    final data = Map<String, dynamic>.from(campaign.toMap());

    data['createdAt'] = FieldValue.serverTimestamp();

    data['updatedAt'] = FieldValue.serverTimestamp();

    data['archived'] = false;

    await document.set(data);

    return document.id;
  }

  Future<void> updateCampaign({
    required String campaignId,
    required Map<String, dynamic> updates,
  }) async {
    if (campaignId.trim().isEmpty) {
      throw Exception('Campaign ID is required.');
    }

    final data = Map<String, dynamic>.from(updates);

    data['updatedAt'] = FieldValue.serverTimestamp();

    await _campaigns.doc(campaignId).update(data);
  }

  Future<Campaign?> getCampaign(String campaignId) async {
    if (campaignId.trim().isEmpty) {
      return null;
    }

    final snapshot = await _campaigns.doc(campaignId).get();

    if (!snapshot.exists) {
      return null;
    }

    return Campaign.fromDocument(snapshot);
  }

  Stream<Campaign?> watchCampaign(String campaignId) {
    return _campaigns.doc(campaignId).snapshots().map((snapshot) {
      if (!snapshot.exists) {
        return null;
      }

      return Campaign.fromDocument(snapshot);
    });
  }

  Stream<List<Campaign>> watchBusinessCampaigns({required String businessId}) {
    return _campaigns
        .where('businessId', isEqualTo: businessId)
        .where('archived', isEqualTo: false)
        .snapshots()
        .map((snapshot) {
          final campaigns = snapshot.docs.map(Campaign.fromDocument).toList();

          campaigns.sort(
            (a, b) => _compareDatesDescending(a.createdAt, b.createdAt),
          );

          return campaigns;
        });
  }

  Future<bool> campaignExists({
    required String businessId,
    required String campaignName,
  }) async {
    final result = await _campaigns
        .where('businessId', isEqualTo: businessId)
        .where('campaignName', isEqualTo: campaignName)
        .limit(1)
        .get();

    return result.docs.isNotEmpty;
  }

  Stream<List<Campaign>> watchAvailableCampaigns() {
    return _campaigns
        .where('status', isEqualTo: 'published')
        .where('archived', isEqualTo: false)
        .snapshots()
        .map((snapshot) {
          final campaigns = snapshot.docs.map(Campaign.fromDocument).toList();

          campaigns.sort(
            (a, b) => _compareDatesDescending(a.createdAt, b.createdAt),
          );

          return campaigns;
        });
  }

  Future<void> publishCampaign(String campaignId) async {
    await updateCampaign(
      campaignId: campaignId,
      updates: {
        'status': 'published',
        'publishedAt': FieldValue.serverTimestamp(),
      },
    );
  }

  Future<void> pauseCampaign(String campaignId) async {
    await updateCampaign(campaignId: campaignId, updates: {'status': 'paused'});
  }

  Future<void> completeCampaign(String campaignId) async {
    await updateCampaign(
      campaignId: campaignId,
      updates: {
        'status': 'completed',
        'completedAt': FieldValue.serverTimestamp(),
      },
    );
  }

  Future<void> cancelCampaign(String campaignId) async {
    await updateCampaign(
      campaignId: campaignId,
      updates: {
        'status': 'cancelled',
        'cancelledAt': FieldValue.serverTimestamp(),
      },
    );
  }

  // ------------------------------------------------------------
  // CAMPAIGN LOCATIONS
  //
  // Used for exact-location work such as:
  // yard signs
  // dump-run pickup/dropoff points
  // event locations
  // material pickup/dropoff locations
  // ------------------------------------------------------------

  Future<String> createLocation({required CampaignLocation location}) async {
    final result = await _secureFunctions.call(
      functionName: 'createCampaignLocation',
      data: {
        'campaignId': location.campaignId,
        'locationType': CampaignLocation.locationTypeValue(location.type),
        'address': location.address,
        'latitude': location.latitude,
        'longitude': location.longitude,
        'instructions': location.instructions,
        'quantity': location.quantity,
      },
    );
    return result['locationId']?.toString() ?? '';
  }

  Future<void> updateLocation({
    required String locationId,
    required Map<String, dynamic> updates,
  }) async {
    if (locationId.trim().isEmpty) {
      throw Exception('Location ID is required.');
    }

    throw UnsupportedError(
      'Campaign locations are immutable after creation. Use the maintained assignment and evidence workflows.',
    );
  }

  Future<void> deleteLocation(String locationId) async {
    if (locationId.trim().isEmpty) {
      throw Exception('Location ID is required.');
    }

    await _secureFunctions.call(
      functionName: 'deleteCampaignLocation',
      data: {'locationId': locationId},
    );
  }

  Stream<List<CampaignLocation>> watchCampaignLocations({
    required String campaignId,
  }) {
    return _campaignLocations
        .where('campaignId', isEqualTo: campaignId)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(CampaignLocation.fromDocument).toList();
        });
  }

  Future<List<CampaignLocation>> getCampaignLocations({
    required String campaignId,
  }) async {
    final snapshot = await _campaignLocations
        .where('campaignId', isEqualTo: campaignId)
        .get();

    return snapshot.docs.map(CampaignLocation.fromDocument).toList();
  }

  // ------------------------------------------------------------
  // MARKETING ASSETS
  //
  // This supports both:
  //
  // 1. Business-provided physical materials
  //    - flyers
  //    - door hangers
  //    - yard signs
  //    - business cards
  //
  // 2. Scaled Circle generated/tracked materials
  //    - QR codes
  //    - tracking URLs
  //    - tracking phone numbers
  //    - landing pages
  //    - tracked email aliases
  // ------------------------------------------------------------

  Future<String> createMarketingAsset({required MarketingAsset asset}) async {
    final document = asset.id.isNotEmpty
        ? _marketingAssets.doc(asset.id)
        : _marketingAssets.doc();

    final data = Map<String, dynamic>.from(asset.toMap());

    data['createdAt'] = FieldValue.serverTimestamp();
    data['updatedAt'] = FieldValue.serverTimestamp();

    await document.set(data);

    return document.id;
  }

  Future<void> updateMarketingAsset({
    required String assetId,
    required Map<String, dynamic> updates,
  }) async {
    if (assetId.trim().isEmpty) {
      throw Exception('Marketing asset ID is required.');
    }

    final data = Map<String, dynamic>.from(updates);

    data['updatedAt'] = FieldValue.serverTimestamp();

    await _marketingAssets.doc(assetId).update(data);
  }

  Future<void> deleteMarketingAsset(String assetId) async {
    if (assetId.trim().isEmpty) {
      throw Exception('Marketing asset ID is required.');
    }

    await _marketingAssets.doc(assetId).delete();
  }

  Stream<List<MarketingAsset>> watchCampaignMarketingAssets({
    required String campaignId,
  }) {
    return _marketingAssets
        .where('campaignId', isEqualTo: campaignId)
        .snapshots()
        .map((snapshot) {
          return snapshot.docs.map(MarketingAsset.fromDocument).toList();
        });
  }

  Future<List<MarketingAsset>> getCampaignMarketingAssets({
    required String campaignId,
  }) async {
    final snapshot = await _marketingAssets
        .where('campaignId', isEqualTo: campaignId)
        .get();

    return snapshot.docs.map(MarketingAsset.fromDocument).toList();
  }

  // ------------------------------------------------------------
  // SCALER APPLICATIONS
  // ------------------------------------------------------------
  Future<void> createApplicationCompletionLink({
    required String campaignId,
    required String scalerId,
    required String completionId,
  }) async {
    await _applications(campaignId).doc(scalerId).update({
      'completionId': completionId,
      'status': 'submitted',
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  CollectionReference<Map<String, dynamic>> _applications(String campaignId) {
    return _campaigns.doc(campaignId).collection('applications');
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> getCampaignApplications(
    String campaignId,
  ) {
    return _applications(
      campaignId,
    ).orderBy('createdAt', descending: true).snapshots();
  }

  Future<void> acceptScalerApplication({
    required String campaignId,
    required String scalerId,
  }) async {
    throw StateError(
      'Choose a zone or exact locations before assigning this Scaler.',
    );
  }

  Future<void> updateApplicationStatus({
    required String campaignId,
    required String scalerId,
    required String status,
  }) async {
    if (status != 'rejected') {
      throw StateError('Application status changes require assignment authority.');
    }
    await _secureFunctions.call(
      functionName: 'rejectCampaignApplication',
      data: {'campaignId': campaignId, 'applicationId': scalerId},
    );
  }
  // ------------------------------------------------------------
  // COMPLETION / PROOF
  // ------------------------------------------------------------

  Future<String> createCompletion({
    required CampaignCompletion completion,
  }) async {
    final result = await _secureFunctions.call(
      functionName: 'initializeCampaignCompletion',
      data: {'campaignId': completion.campaignId},
    );
    return result['completionId']?.toString() ?? '';
  }

  Future<void> updateCompletion({
    required String completionId,
    required Map<String, dynamic> updates,
  }) async {
    if (completionId.trim().isEmpty) {
      throw Exception('Completion ID is required.');
    }

    throw UnsupportedError(
      'Completion state is server-authoritative. Use evidence, submission, or review operations.',
    );
  }

  Future<CampaignCompletion?> getCompletion(String completionId) async {
    if (completionId.trim().isEmpty) {
      return null;
    }

    final snapshot = await _campaignCompletions.doc(completionId).get();

    if (!snapshot.exists) {
      return null;
    }

    return CampaignCompletion.fromDocument(snapshot);
  }

  Stream<List<CampaignCompletion>> watchCampaignCompletions({
    required String campaignId,
  }) {
    return _campaignCompletions
        .where('campaignId', isEqualTo: campaignId)
        .snapshots()
        .map((snapshot) {
          final completions = snapshot.docs
              .map(CampaignCompletion.fromDocument)
              .toList();

          completions.sort(
            (a, b) => _compareDatesDescending(
              a.submittedAt ?? a.createdAt,
              b.submittedAt ?? b.createdAt,
            ),
          );

          return completions;
        });
  }

  Stream<List<CampaignCompletion>> watchScalerCompletions({
    required String scalerId,
  }) {
    return _campaignCompletions
        .where('scalerId', isEqualTo: scalerId)
        .snapshots()
        .map((snapshot) {
          final completions = snapshot.docs
              .map(CampaignCompletion.fromDocument)
              .toList();

          completions.sort(
            (a, b) => _compareDatesDescending(
              a.submittedAt ?? a.createdAt,
              b.submittedAt ?? b.createdAt,
            ),
          );

          return completions;
        });
  }

  Future<void> submitCompletion({
    required String completionId,
    String? scalerNotes,
  }) async {
    await _secureFunctions.call(
      functionName: 'submitCampaignCompletion',
      data: {
        'completionId': completionId,
        'scalerNotes': scalerNotes?.trim() ?? '',
      },
    );
  }

  Future<void> approveCompletion({
    required String completionId,
    String? businessFeedback,
  }) async {
    await _secureFunctions.call(
      functionName: 'reviewCampaignCompletion',
      data: {
        'completionId': completionId,
        'decision': 'approve',
        'feedback': businessFeedback?.trim() ?? '',
      },
    );
  }

  Future<void> requestCompletionChanges({
    required String completionId,
    required String feedback,
  }) async {
    if (feedback.trim().isEmpty) {
      throw Exception('Feedback is required when requesting changes.');
    }

    await _secureFunctions.call(
      functionName: 'reviewCampaignCompletion',
      data: {
        'completionId': completionId,
        'decision': 'changes_required',
        'feedback': feedback.trim(),
      },
    );
  }

  Future<void> rejectCompletion({
    required String completionId,
    required String feedback,
  }) async {
    if (feedback.trim().isEmpty) {
      throw Exception('Feedback is required when rejecting completion.');
    }

    await _secureFunctions.call(
      functionName: 'reviewCampaignCompletion',
      data: {
        'completionId': completionId,
        'decision': 'reject',
        'feedback': feedback.trim(),
      },
    );
  }

  // ------------------------------------------------------------
  // PROOF HELPERS
  // ------------------------------------------------------------

  Future<void> addCompletionProof({
    required String completionId,
    CompletionProof? proof,
    CompletionProofType? proofType,
    String? campaignLocationId,
    String? photoUrl,
    double? latitude,
    double? longitude,
    String? note,
  }) async {
    if (completionId.trim().isEmpty) {
      throw Exception('Completion ID is required.');
    }

    CompletionProof finalProof;

    if (proof != null) {
      finalProof = proof;
    } else {
      if (proofType == null) {
        throw Exception('Proof type is required.');
      }

      if (photoUrl == null || photoUrl.trim().isEmpty) {
        throw Exception('Photo URL is required.');
      }

      finalProof = CompletionProof(
        id: _campaignCompletions.doc().id,
        type: proofType,
        fileUrl: photoUrl,
        campaignLocationId: campaignLocationId,
        latitude: latitude,
        longitude: longitude,
        note: note,
        capturedAt: DateTime.now(),
      );
    }

    await _secureFunctions.call(
      functionName: 'appendCampaignCompletionEvidence',
      data: {'completionId': completionId, 'proof': finalProof.toMap()},
    );
  }
  // ------------------------------------------------------------
  // CAMPAIGN ARCHIVE / TEST MANAGEMENT
  // ------------------------------------------------------------
  //
  // We do not permanently delete campaigns after launch.
  //
  // Reasons:
  // - protects payment records
  // - protects scaler proof history
  // - prevents broken references
  // - allows businesses to restore mistakes
  //
  // Only unused TEST campaigns may be deleted.
  // ------------------------------------------------------------

  Future<void> archiveCampaign({
    required String campaignId,
    required String userId,
  }) async {
    if (campaignId.trim().isEmpty) {
      throw Exception('Campaign ID is required.');
    }

    await _campaigns.doc(campaignId).update({
      'status': 'archived',
      'archived': true,
      'archivedBy': userId,
      'archivedAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> restoreCampaign({required String campaignId}) async {
    if (campaignId.trim().isEmpty) {
      throw Exception('Campaign ID is required.');
    }

    await _campaigns.doc(campaignId).update({
      'archived': false,
      'status': 'draft',
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<bool> canDeleteCampaign(String campaignId) async {
    final campaign = await _campaigns.doc(campaignId).get();

    if (!campaign.exists) {
      return false;
    }

    final data = campaign.data();

    // Only allow deleting test campaigns
    if (data?['isTestCampaign'] != true) {
      return false;
    }

    final applications = await _applications(campaignId).limit(1).get();

    final locations = await _campaignLocations
        .where('campaignId', isEqualTo: campaignId)
        .limit(1)
        .get();

    final completions = await _campaignCompletions
        .where('campaignId', isEqualTo: campaignId)
        .limit(1)
        .get();

    return applications.docs.isEmpty &&
        locations.docs.isEmpty &&
        completions.docs.isEmpty;
  }

  Future<void> deleteTestCampaign({required String campaignId}) async {
    final allowed = await canDeleteCampaign(campaignId);

    if (!allowed) {
      throw Exception('Only unused test campaigns can be permanently deleted.');
    }

    await _campaigns.doc(campaignId).delete();
  }

  Future<void> replaceCompletionProofs({
    required String completionId,
    required List<CompletionProof> proofs,
  }) async {
    throw UnsupportedError(
      'Completion evidence is append-only. Add a new proof instead of replacing history.',
    );
  }

  // ------------------------------------------------------------
  // YARD SIGN COMPLETION
  //
  // Every sign can be associated with an exact campaignLocationId.
  // That lets the business specify the location and later see the
  // photo proof associated with that exact requested sign location.
  // ------------------------------------------------------------

  Future<void> addYardSignProof({
    required String completionId,
    required String campaignLocationId,
    required String photoUrl,
    required double latitude,
    required double longitude,
    String? note,
  }) async {
    if (campaignLocationId.trim().isEmpty) {
      throw Exception('Campaign location ID is required for yard sign proof.');
    }

    if (photoUrl.trim().isEmpty) {
      throw Exception('A photo is required for yard sign proof.');
    }

    final proof = CompletionProof(
      id: _campaignCompletions.doc().id,
      type: CompletionProofType.installationPhoto,
      fileUrl: photoUrl,
      note: note,
      campaignLocationId: campaignLocationId,
      latitude: latitude,
      longitude: longitude,
      capturedAt: DateTime.now(),
    );

    await addCompletionProof(completionId: completionId, proof: proof);
  }

  // ------------------------------------------------------------
  // DUMP RUN PROOF
  //
  // Dump runs can eventually require:
  // - before photo
  // - loaded vehicle/trailer photo
  // - dump receipt/photo
  // - after photo
  // ------------------------------------------------------------

  Future<void> addDumpRunPhoto({
    required String completionId,
    required CompletionProofType proofType,
    required String photoUrl,
    double? latitude,
    double? longitude,
    String? note,
  }) async {
    const allowedTypes = {
      CompletionProofType.beforePhoto,
      CompletionProofType.loadedPhoto,
      CompletionProofType.receiptPhoto,
      CompletionProofType.afterPhoto,
    };

    if (!allowedTypes.contains(proofType)) {
      throw Exception('Invalid proof type for a dump run.');
    }

    if (photoUrl.trim().isEmpty) {
      throw Exception('A photo is required.');
    }

    final proof = CompletionProof(
      id: _campaignCompletions.doc().id,
      type: proofType,
      fileUrl: photoUrl,
      note: note,
      latitude: latitude,
      longitude: longitude,
      capturedAt: DateTime.now(),
    );

    await addCompletionProof(completionId: completionId, proof: proof);
  }

  // ------------------------------------------------------------
  // MATERIAL HANDOFF
  //
  // Physical marketing materials cannot literally be digitally
  // delivered. Instead, the campaign records the handoff workflow:
  //
  // Scaler pickup from a printing shop
  // Scaler pickup from the Business
  // Business delivery to the Scaler/group staging location
  // no physical materials
  //
  // These fields let the UI manage that workflow without pretending
  // the physical item itself is digital.
  // ------------------------------------------------------------

  Future<void> updateMaterialHandoff({
    required String campaignId,
    required String method,
    String? address,
    double? latitude,
    double? longitude,
    DateTime? scheduledAt,
    String? instructions,
  }) async {
    const supportedMethods = {
      'scaler_pickup_print_shop',
      'scaler_pickup_business',
      'business_delivery',
      'no_materials_required',
    };

    if (!supportedMethods.contains(method)) {
      throw Exception('Unknown material handoff method.');
    }

    await updateCampaign(
      campaignId: campaignId,
      updates: {
        'materialHandoffMethod': method,
        'materialHandoffAddress': address,
        'materialHandoffLatitude': latitude,
        'materialHandoffLongitude': longitude,
        if (scheduledAt != null)
          'materialHandoffScheduledAt': Timestamp.fromDate(scheduledAt),
        'materialHandoffInstructions': instructions,
      },
    );
  }

  // ------------------------------------------------------------
  // TRACKING
  //
  // These fields give us one campaign-level place to attach the
  // attribution infrastructure later:
  //
  // QR -> tracking URL
  // phone -> forwarding number
  // email -> forwarding alias
  // landing page -> campaign landing page
  // ------------------------------------------------------------

  Future<void> updateCampaignTracking({
    required String campaignId,
    String? trackingUrl,
    String? qrCodeUrl,
    String? trackingPhoneNumber,
    String? forwardingPhoneNumber,
    String? trackingEmail,
    String? forwardingEmail,
    String? landingPageUrl,
  }) async {
    await updateCampaign(
      campaignId: campaignId,
      updates: {
        'trackingEnabled': true,
        'trackingUrl': trackingUrl,
        'qrCodeUrl': qrCodeUrl,
        'trackingPhoneNumber': trackingPhoneNumber,
        'forwardingPhoneNumber': forwardingPhoneNumber,
        'trackingEmail': trackingEmail,
        'forwardingEmail': forwardingEmail,
        'landingPageUrl': landingPageUrl,
      },
    );
  }

  Future<void> disableCampaignTracking({required String campaignId}) async {
    await updateCampaign(
      campaignId: campaignId,
      updates: {'trackingEnabled': false},
    );
  }

  // ------------------------------------------------------------
  // INTERNAL HELPERS
  // ------------------------------------------------------------

  int _compareDatesDescending(DateTime? first, DateTime? second) {
    if (first == null && second == null) {
      return 0;
    }

    if (first == null) {
      return 1;
    }

    if (second == null) {
      return -1;
    }

    return second.compareTo(first);
  }
}
