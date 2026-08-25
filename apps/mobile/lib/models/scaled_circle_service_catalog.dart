class ScaledCircleServiceItem {
  const ScaledCircleServiceItem({
    required this.category,
    required this.name,
    required this.requiredPlan,
    this.beta = false,
  });

  final String category;
  final String name;
  final String requiredPlan;
  final bool beta;

  bool entitledFor(String? plan) =>
      ScaledCircleServiceCatalog.rank(plan) >=
      ScaledCircleServiceCatalog.rank(requiredPlan);
}

class ScaledCircleServiceCatalog {
  static int rank(String? plan) => switch (plan?.toLowerCase()) {
    'starter' => 1,
    'growth' => 2,
    'scale' => 3,
    'managed_growth' => 4,
    _ => 0,
  };

  static const items = <ScaledCircleServiceItem>[
    ScaledCircleServiceItem(
      category: 'INTELLIGENCE',
      name: 'Property Intelligence',
      requiredPlan: 'scale',
      beta: true,
    ),
    ScaledCircleServiceItem(
      category: 'INTELLIGENCE',
      name: 'Weather Intelligence',
      requiredPlan: 'scale',
      beta: true,
    ),
    ScaledCircleServiceItem(
      category: 'INTELLIGENCE',
      name: 'AI Business Analysis',
      requiredPlan: 'managed_growth',
      beta: true,
    ),
    ScaledCircleServiceItem(
      category: 'GROWTH',
      name: 'Growth Plan',
      requiredPlan: 'managed_growth',
      beta: true,
    ),
    ScaledCircleServiceItem(
      category: 'GROWTH',
      name: 'Social Content',
      requiredPlan: 'managed_growth',
      beta: true,
    ),
    ScaledCircleServiceItem(
      category: 'GROWTH',
      name: 'Advertising',
      requiredPlan: 'managed_growth',
      beta: true,
    ),
    ScaledCircleServiceItem(
      category: 'GROWTH',
      name: 'SEO',
      requiredPlan: 'managed_growth',
      beta: true,
    ),
    ScaledCircleServiceItem(
      category: 'GROWTH',
      name: 'Email',
      requiredPlan: 'managed_growth',
      beta: true,
    ),
    ScaledCircleServiceItem(
      category: 'GROWTH',
      name: 'Postcards / Direct Mail',
      requiredPlan: 'managed_growth',
      beta: true,
    ),
    ScaledCircleServiceItem(
      category: 'EXECUTION',
      name: 'Field Campaigns',
      requiredPlan: 'starter',
    ),
    ScaledCircleServiceItem(
      category: 'EXECUTION',
      name: 'Campaign Operations / Job Room',
      requiredPlan: 'starter',
    ),
    ScaledCircleServiceItem(
      category: 'ANALYTICS',
      name: 'Growth Analytics',
      requiredPlan: 'managed_growth',
      beta: true,
    ),
    ScaledCircleServiceItem(
      category: 'ANALYTICS',
      name: 'Campaign Results',
      requiredPlan: 'starter',
    ),
  ];
}
