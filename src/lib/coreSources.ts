import type { ResearchSource } from './research';

const importedAt = '2026-07-30T00:00:00.000Z';

export const coreResearchSources: ResearchSource[] = [
  {
    id: 'core-protein-morton-2018',
    externalId: 'pmid-28698222',
    title:
      'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults.',
    abstract:
      'Meta-analysis of resistance-training studies indicates protein supplementation can improve gains in fat-free mass and strength, with benefits tending to plateau around higher daily protein intakes. Practical coaching use: set protein targets from body mass, keep intake consistent across the day, and adjust calories separately for bulk or fat-loss goals.',
    source: 'PubMed',
    journal: 'British Journal of Sports Medicine',
    year: '2018',
    date: '2018',
    authors: 'Morton RW et al.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
    doi: '10.1136/bjsports-2017-097608',
    pmid: '28698222',
    tags: ['Protein', 'Hypertrophy', 'Nutrition'],
    importedAt
  },
  {
    id: 'core-volume-schoenfeld-2017',
    externalId: 'pmid-27433992',
    title: 'Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis.',
    abstract:
      'Weekly resistance-training volume shows a dose-response relationship with hypertrophy across studied programs. Practical coaching use: most lifters should begin with recoverable weekly hard-set targets, then increase volume only when performance and recovery support it.',
    source: 'PubMed',
    journal: 'Journal of Sports Sciences',
    year: '2017',
    date: '2017',
    authors: 'Schoenfeld BJ et al.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/27433992/',
    doi: '10.1080/02640414.2016.1210197',
    pmid: '27433992',
    tags: ['Hypertrophy', 'Volume', 'Training'],
    importedAt
  },
  {
    id: 'core-failure-grgic-2022',
    externalId: 'pmid-33497853',
    title: 'Effects of resistance training performed to repetition failure or non-failure on muscular strength and hypertrophy: A systematic review and meta-analysis.',
    abstract:
      'Training to failure and non-failure can both support hypertrophy and strength, but failure is not required for every set and can add fatigue cost. Practical coaching use: reserve failure for selected isolation or low-risk sets, while keeping most compound work near one to three reps in reserve.',
    source: 'PubMed',
    journal: 'Journal of Sport and Health Science',
    year: '2022',
    date: '2022',
    authors: 'Grgic J et al.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/33497853/',
    doi: '10.1016/j.jshs.2021.01.007',
    pmid: '33497853',
    tags: ['Failure', 'RPE', 'Hypertrophy'],
    importedAt
  },
  {
    id: 'core-advanced-methods-2026',
    externalId: 'pmid-41951916',
    title:
      'The Effects of Advanced Resistance Training Prescription Methods on Strength, Power, Hypertrophy, and Performance Adaptations in Healthy Adults: A Systematic Review and Bayesian Network Meta-analysis.',
    abstract:
      'Review of advanced resistance-training methods suggests traditional well-progressed training remains a strong default, and advanced methods should be used for specific constraints or preference rather than assumed superiority. Practical coaching use: prioritize progression, execution, adherence, and recovery before adding intensity techniques.',
    source: 'PubMed',
    journal: 'Sports Medicine',
    year: '2026',
    date: '2026',
    authors: 'Sports Medicine review authors',
    url: 'https://pubmed.ncbi.nlm.nih.gov/41951916/',
    doi: '10.1007/s40279-026-02428-1',
    pmid: '41951916',
    tags: ['Hypertrophy', 'Programming', 'Strength'],
    importedAt
  },
  {
    id: 'core-protein-creatine-omega-2026',
    externalId: 'pmid-41901084',
    title:
      'Comparative Effects of Dietary Protein, Creatine, and Omega-3 Supplementation on Muscle Strength, Endurance, and Recovery in Trained Athletes: A Systematic Review and Network Meta-Analysis.',
    abstract:
      'Network meta-analysis in trained athletes compares protein, creatine, and omega-3 supplementation for strength, endurance, and recovery outcomes. Practical coaching use: nutrition and supplements are adjuncts to progressive training; prioritize protein adequacy, then consider creatine when appropriate.',
    source: 'PubMed',
    journal: 'Nutrients',
    year: '2026',
    date: '2026',
    authors: 'Nutrients review authors',
    url: 'https://pubmed.ncbi.nlm.nih.gov/41901084/',
    doi: '10.3390/nu18060909',
    pmid: '41901084',
    tags: ['Protein', 'Creatine', 'Recovery'],
    importedAt
  },
  {
    id: 'core-body-composition-obesity-2026',
    externalId: 'pmid-42309659',
    title: 'Effects of different exercise interventions on body composition in women with overweight and obesity: a systematic review and network meta-analysis.',
    abstract:
      'Exercise interventions can improve body-composition outcomes in overweight and obesity, with resistance training helping preserve or improve lean tissue while fat loss is driven by the broader energy balance strategy. Practical coaching use: combine calorie control, protein adequacy, and progressive resistance training during fat-loss phases.',
    source: 'PubMed',
    journal: 'BMJ Open',
    year: '2026',
    date: '2026',
    authors: 'BMJ Open review authors',
    url: 'https://pubmed.ncbi.nlm.nih.gov/42309659/',
    doi: '10.1136/bmjopen-2025-113206',
    pmid: '42309659',
    tags: ['Fat loss', 'Body composition', 'Training'],
    importedAt
  },
  {
    id: 'core-natural-bodybuilding-2014',
    externalId: 'pmid-24864135',
    title: 'Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation.',
    abstract:
      'Evidence-based bodybuilding recommendations emphasize high protein intake, gradual rates of loss, resistance training retention, and careful management of recovery during dieting. Practical coaching use: when cutting, keep the deficit controlled, maintain lifting performance, and avoid rapid loss that risks lean-mass retention.',
    source: 'PubMed',
    journal: 'Journal of the International Society of Sports Nutrition',
    year: '2014',
    date: '2014',
    authors: 'Helms ER et al.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/24864135/',
    doi: '10.1186/1550-2783-11-20',
    pmid: '24864135',
    tags: ['Fat loss', 'Protein', 'Bodybuilding'],
    importedAt
  },
  {
    id: 'core-creatine-2026',
    externalId: 'pmid-42027564',
    title: 'Creatine supplementation in young men under resistance versus non-resistance training: a systematic review and meta-analysis of strength, performance, and lean mass.',
    abstract:
      'Creatine supplementation is commonly studied alongside resistance training for strength, performance, and lean-mass outcomes. Practical coaching use: creatine can be considered as a low-cost supplement option when hydration, nutrition, and training basics are already consistent.',
    source: 'PubMed',
    journal: 'Frontiers in Nutrition',
    year: '2026',
    date: '2026',
    authors: 'Frontiers review authors',
    url: 'https://pubmed.ncbi.nlm.nih.gov/42027564/',
    doi: '10.3389/fnut.2026.1800546',
    pmid: '42027564',
    tags: ['Creatine', 'Strength', 'Lean mass'],
    importedAt
  },
  {
    id: 'core-acsm-position-2026',
    externalId: 'pmid-41843416',
    title: 'American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews.',
    abstract:
      'The ACSM position stand reviews resistance-training prescription for hypertrophy, function, and performance in healthy adults. Practical coaching use: build plans around specificity, progressive overload, adequate weekly volume, technical execution, and individualized recovery tolerance.',
    source: 'PubMed',
    journal: 'Medicine and Science in Sports and Exercise',
    year: '2026',
    date: '2026',
    authors: 'American College of Sports Medicine',
    url: 'https://pubmed.ncbi.nlm.nih.gov/41843416/',
    doi: '10.1249/mss.0000000000003897',
    pmid: '41843416',
    tags: ['Training', 'Hypertrophy', 'Guidelines'],
    importedAt
  },
  {
    id: 'core-high-quality-weight-loss-2025',
    externalId: 'pmid-40627348',
    title: 'High-Quality Weight Loss in Obesity: Importance of Skeletal Muscle.',
    abstract:
      'High-quality weight loss emphasizes reducing fat mass while preserving skeletal muscle and function. Practical coaching use: during weight loss, combine resistance training, sufficient protein, conservative rates of loss, and performance tracking to reduce the risk of excessive lean-mass loss.',
    source: 'PubMed',
    journal: 'Diabetes',
    year: '2025',
    date: '2025',
    authors: 'Diabetes review authors',
    url: 'https://pubmed.ncbi.nlm.nih.gov/40627348/',
    doi: '10.2337/dbi25-0003',
    pmid: '40627348',
    tags: ['Fat loss', 'Lean mass', 'Health'],
    importedAt
  }
];
