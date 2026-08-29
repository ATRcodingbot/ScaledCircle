abstract final class AppRoutes {
  static const login = '/login';
  static const createAccount = '/create-account';
  static const publicExperience = '/i';
  static const businesses = '/businesses';
  static const scalers = '/scalers';
  static const businessDashboard = '/business';
  static const businessAttribution = '/business/attribution';
  static const businessLandingPages = '/business/landing-pages';
  static const businessBrandAssets = '/business/brand-assets';
  static const scalerDashboard = '/scaler';
  static const adminLogin = '/admin/login';
  static const adminDashboard = '/admin';
  static const sales = '/sales';
  static const verifyEmail = '/verify-email';
  static const campaignFundingReturn = '/campaign-funding-return';
  static const legal = '/legal';
  static const terms = '/terms';
  static const privacy = '/privacy';
  static const refunds = '/payments-refunds';
  static const scalerTerms = '/scaler-terms';
  static const support = '/support';
  static const completeScalerProfile = '/complete-scaler-profile';
  static const campaignDetailPrefix = '/campaign';
  static const jobRoomPrefix = '/job-room';

  static String campaignDetail(String campaignId) =>
      '$campaignDetailPrefix/${Uri.encodeComponent(campaignId)}';

  static String jobRoom(String zoneId) =>
      '$jobRoomPrefix/${Uri.encodeComponent(zoneId)}';
}
