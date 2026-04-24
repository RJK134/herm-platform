import type { ScoringMethodologyRecord } from './types';

export const methodologyRecords: ScoringMethodologyRecord[] = [
    {
      category: 'scoring_model',
      content: {
        title: 'HERM Capability Scoring Model',
        overview: 'Each system is scored against 165 HERM v3.1 business capabilities using a three-tier model.',
        tiers: [
          {
            value: 100,
            label: 'Full Coverage',
            description: 'The system fully delivers this capability natively, out-of-the-box, without significant customisation.',
            criteria: [
              'Capability is available in the standard product',
              'No additional modules or licences required',
              'Functionality is production-ready and widely deployed',
              'Evidence from analyst reports, case studies, or official documentation',
            ],
          },
          {
            value: 50,
            label: 'Partial Coverage',
            description: 'The system provides partial coverage — either through a limited implementation, requiring add-ons, or via partner integrations.',
            criteria: [
              'Core functionality present but limited in scope',
              'Requires additional configuration, modules, or third-party tools',
              'Functionality exists but is not the primary use case',
              'Roadmap commitment with partial current delivery',
            ],
          },
          {
            value: 0,
            label: 'No Coverage',
            description: 'The system does not cover this capability, or coverage requires a separate product entirely.',
            criteria: [
              'No native functionality for this capability',
              'Would require a separate, independently licensed system',
              'Explicitly out of scope for this product category',
              'No roadmap commitment found in public documentation',
            ],
          },
        ],
        weightingNote: 'All capabilities are currently weighted equally. Future releases will support institution-specific weighting via the Capability Basket feature.',
      },
    },
    {
      category: 'evidence_types',
      content: {
        title: 'Evidence Types and Sources',
        overview: 'Scores are based on evidence from multiple source types, ranked by reliability.',
        sources: [
          {
            type: 'Official Documentation',
            reliability: 'High',
            description: 'Vendor product documentation, datasheets, and feature lists from official vendor websites.',
            examples: ['Product feature pages', 'Technical specifications', 'Release notes', 'API documentation'],
          },
          {
            type: 'Analyst Reports',
            reliability: 'High',
            description: 'Independent analysis from recognised HE technology analysts.',
            examples: ['Gartner Magic Quadrant', 'Forrester Wave', 'IDC MarketScape', 'Ovum/Omdia reports', 'EDUCAUSE research'],
          },
          {
            type: 'Case Studies',
            reliability: 'Medium-High',
            description: 'Published implementation case studies from HE institutions.',
            examples: ['Vendor-published case studies', 'Jisc case studies', 'EDUCAUSE case studies', 'Conference presentations'],
          },
          {
            type: 'Sector Surveys',
            reliability: 'Medium',
            description: 'Survey-based research from HE sector bodies.',
            examples: ['UCISA Digital Capabilities Survey', 'Jisc Technology Reports', 'Times Higher Education surveys'],
          },
          {
            type: 'Community Knowledge',
            reliability: 'Medium',
            description: 'Practitioner knowledge from the HE technology community.',
            examples: ['UCISA community forums', 'LinkedIn HE groups', 'Conference discussions', 'Practitioner interviews'],
          },
        ],
        updateFrequency: 'Scores are reviewed annually, or when major product releases occur. Version history tracks score changes over time.',
      },
    },
    {
      category: 'review_process',
      content: {
        title: 'Review and Update Process',
        overview: 'How Future Horizons ASPT scores are maintained and quality-assured.',
        process: [
          {
            stage: 1,
            name: 'Initial Scoring',
            description: 'Scores are initially set based on desk research using official documentation and analyst reports.',
            frequency: 'One-time per system onboarding',
          },
          {
            stage: 2,
            name: 'Community Review',
            description: 'Practitioners with experience of the system are invited to review and challenge scores.',
            frequency: 'Ongoing — via Submit Evidence feature',
          },
          {
            stage: 3,
            name: 'Annual Refresh',
            description: 'All scores reviewed against latest analyst reports and vendor documentation.',
            frequency: 'Annual — typically Q1 each year',
          },
          {
            stage: 4,
            name: 'Major Release Update',
            description: 'Scores updated when a major product version is released that changes capability coverage.',
            frequency: 'Event-driven — following vendor announcements',
          },
        ],
        governance: {
          editorialBoard: 'A panel of UK HE IT professionals oversees scoring decisions for disputed capabilities.',
          vendorInput: 'Vendors may submit evidence but cannot directly edit scores. All vendor submissions are reviewed by the editorial board.',
          transparency: 'All score changes are logged with reason codes. Version history is publicly visible.',
        },
      },
    },
    {
      category: 'faq',
      content: {
        title: 'Frequently Asked Questions',
        questions: [
          {
            q: 'Why are scores 0, 50, or 100 only?',
            a: 'The three-tier model (None/Partial/Full) is intentionally simple to ensure consistency across 165 capabilities and 21 systems. Finer granularity would require deeper per-installation knowledge that is impractical at this scale. The model is designed for procurement shortlisting, not final selection — detailed RFP processes should follow for shortlisted systems.',
          },
          {
            q: 'Do the scores represent a specific version of each product?',
            a: 'Scores represent the generally available (GA) version at the time of last review. The Version History feature (Phase 2) will track capability changes across major releases. Check the lastUpdated date on each system profile.',
          },
          {
            q: 'My institution uses Banner/SITS/[other system] and it does X — why is it scored 0?',
            a: 'Scores represent out-of-the-box capability without bespoke customisation. Many institutions have developed custom extensions that deliver capabilities not present in the standard product. These are valuable but are institution-specific and not transferable. Use the Submit Evidence button to share your experience.',
          },
          {
            q: 'Why is SJMS included alongside commercial systems?',
            a: 'SJMS is the internal system being built to HERM v3.1 specification. Including it provides a live benchmark showing current coverage and gap areas. It serves as a reference point for understanding what "full UK HE compliance" requires.',
          },
          {
            q: 'How do I use this for procurement?',
            a: 'Use the Capability Basket to define your Must Have / Should Have / Could Have requirements. Score each basket item by priority. The system will calculate weighted scores for each vendor against your specific requirements — giving a procurement-specific ranking rather than the overall HERM score.',
          },
          {
            q: 'Are LMS scores comparable to SIS scores?',
            a: 'Not directly. Different system categories (SIS, LMS, CRM, HCM) are designed for different HERM capability families. The overall score reflects total HERM coverage but should be interpreted within category. Use the Family-level scores (e.g., Learning & Teaching vs Financial Management) for meaningful cross-category comparisons.',
          },
          {
            q: 'How current is the data?',
            a: 'Each system profile shows a lastUpdated date. The platform is updated quarterly with a full annual refresh each January. Major version releases trigger immediate score reviews for the affected system.',
          },
          {
            q: 'Can vendors update their own scores?',
            a: 'No. Vendors can submit evidence for editorial board review but cannot directly modify scores. This maintains editorial independence. Contact us if you are a vendor and believe a score is incorrect.',
          },
        ],
      },
    },
  ];
