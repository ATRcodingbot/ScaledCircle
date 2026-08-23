abstract final class AppRoutes {
  static const login = '/login';
  static const createAccount = '/create-account';
  static const publicExperience = '/i';
  static const businesses = '/businesses';
  static const scalers = '/scalers';
  static const businessDashboard = '/business';
  static const scalerDashboard = '/scaler';
  static const adminLogin = '/admin/login';
  static const adminDashboard = '/admin';
  static const verifyEmail = '/verify-email';
  static const campaignFundingReturn = '/campaign-funding-return';
  static const completeScalerProfile = '/complete-scaler-profile';
  static const campaignDetailPrefix = '/campaign';
  static const jobRoomPrefix = '/job-room';

  static String campaignDetail(String campaignId) =>
      '$campaignDetailPrefix/${Uri.encodeComponent(campaignId)}';

  static String jobRoom(String zoneId) =>
      '$jobRoomPrefix/${Uri.encodeComponent(zoneId)}';
}
