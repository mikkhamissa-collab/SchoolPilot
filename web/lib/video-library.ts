/**
 * Curated Video Library for AP Courses
 *
 * Hand-picked, high-quality videos from Khan Academy, Organic Chemistry Tutor,
 * Professor Leonard, 3Blue1Brown, and other trusted educators.
 *
 * Each video has been vetted for:
 * - Clear explanations
 * - Accurate content
 * - Appropriate length (5-20 min ideal)
 * - Good production quality
 */

export interface Video {
  id: string;
  title: string;
  url: string;
  duration: string; // e.g., "12:34"
  channel: string;
  thumbnail?: string;
  difficulty: 'intro' | 'standard' | 'advanced';
  type: 'concept' | 'worked-example' | 'practice' | 'review';
}

export interface Topic {
  id: string;
  name: string;
  keywords: string[]; // For matching against unit descriptions
  videos: Video[];
}

export interface Course {
  id: string;
  name: string;
  topics: Topic[];
}

// ============================================================================
// AP STATISTICS
// ============================================================================
const apStatistics: Course = {
  id: 'ap-statistics',
  name: 'AP Statistics',
  topics: [
    {
      id: 'stat-describing-data',
      name: 'Describing Data',
      keywords: ['histogram', 'box plot', 'stem and leaf', 'distribution', 'shape', 'center', 'spread', 'outliers', 'describing data', 'graphical displays'],
      videos: [
        {
          id: 'stat-1-1',
          title: 'Introduction to Statistics - Describing Data',
          url: 'https://www.youtube.com/watch?v=xxpc-HPKN28',
          duration: '14:23',
          channel: 'Khan Academy',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-1-2',
          title: 'Histograms | Pair of Dice',
          url: 'https://www.youtube.com/watch?v=4eLJGG2Ad30',
          duration: '8:45',
          channel: 'Khan Academy',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-1-3',
          title: 'Box and Whisker Plots Explained',
          url: 'https://www.youtube.com/watch?v=b2C9I8HuCe4',
          duration: '11:52',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-1-4',
          title: 'Mean, Median, Mode, Range - Statistics',
          url: 'https://www.youtube.com/watch?v=k3aKKasOmIw',
          duration: '18:34',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-1-5',
          title: 'Standard Deviation and Variance',
          url: 'https://www.youtube.com/watch?v=SzZ6GpcfoQY',
          duration: '13:27',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'stat-normal-distribution',
      name: 'Normal Distribution',
      keywords: ['normal', 'bell curve', 'z-score', 'standard normal', 'empirical rule', '68-95-99.7', 'normal distribution', 'gaussian'],
      videos: [
        {
          id: 'stat-2-1',
          title: 'Normal Distribution - Explained Simply',
          url: 'https://www.youtube.com/watch?v=rzFX5NWojp0',
          duration: '15:42',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-2-2',
          title: 'Z-Scores and the Standard Normal Distribution',
          url: 'https://www.youtube.com/watch?v=uAxyI_XfqXk',
          duration: '12:18',
          channel: 'Khan Academy',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'stat-2-3',
          title: 'Finding Probabilities with the Normal Distribution',
          url: 'https://www.youtube.com/watch?v=Wp2nHKCTeKI',
          duration: '19:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-2-4',
          title: 'Empirical Rule (68-95-99.7) Practice Problems',
          url: 'https://www.youtube.com/watch?v=SxPVD4kvWso',
          duration: '10:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'practice'
        }
      ]
    },
    {
      id: 'stat-sampling',
      name: 'Sampling and Experimental Design',
      keywords: ['sampling', 'random sample', 'bias', 'survey', 'experiment', 'observational study', 'confounding', 'blocking', 'randomization', 'SRS', 'stratified', 'cluster'],
      videos: [
        {
          id: 'stat-3-1',
          title: 'Sampling Methods - SRS, Stratified, Cluster, Systematic',
          url: 'https://www.youtube.com/watch?v=be9e-Q-jC-0',
          duration: '16:21',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-3-2',
          title: 'Bias in Surveys and Experiments',
          url: 'https://www.youtube.com/watch?v=TqOeMYtOc1w',
          duration: '11:47',
          channel: 'Khan Academy',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'stat-3-3',
          title: 'Experimental Design - Control, Randomization, Replication',
          url: 'https://www.youtube.com/watch?v=kkBDa-ICvyY',
          duration: '14:55',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'stat-3-4',
          title: 'Confounding Variables Explained',
          url: 'https://www.youtube.com/watch?v=cIx0c-BZ9gI',
          duration: '8:32',
          channel: 'Khan Academy',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'stat-probability',
      name: 'Probability',
      keywords: ['probability', 'conditional', 'independent', 'mutually exclusive', 'bayes', 'tree diagram', 'addition rule', 'multiplication rule', 'complement'],
      videos: [
        {
          id: 'stat-4-1',
          title: 'Introduction to Probability - Basic Concepts',
          url: 'https://www.youtube.com/watch?v=uzkc-qNVoOk',
          duration: '12:44',
          channel: 'Khan Academy',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-4-2',
          title: 'Conditional Probability Explained with Examples',
          url: 'https://www.youtube.com/watch?v=_IgyaD7vOOA',
          duration: '17:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-4-3',
          title: 'Addition Rule and Multiplication Rule',
          url: 'https://www.youtube.com/watch?v=94AmzeR9n2w',
          duration: '15:21',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-4-4',
          title: "Bayes' Theorem - The Simplest Case",
          url: 'https://www.youtube.com/watch?v=XQoLVl31ZfQ',
          duration: '14:08',
          channel: '3Blue1Brown',
          difficulty: 'advanced',
          type: 'concept'
        },
        {
          id: 'stat-4-5',
          title: 'Tree Diagrams for Probability Problems',
          url: 'https://www.youtube.com/watch?v=gJXwmCVdTzY',
          duration: '11:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'stat-random-variables',
      name: 'Random Variables',
      keywords: ['random variable', 'discrete', 'continuous', 'expected value', 'variance', 'binomial', 'geometric', 'probability distribution'],
      videos: [
        {
          id: 'stat-5-1',
          title: 'Random Variables - Discrete and Continuous',
          url: 'https://www.youtube.com/watch?v=3v9w79NhsfI',
          duration: '13:45',
          channel: 'Khan Academy',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-5-2',
          title: 'Expected Value and Variance',
          url: 'https://www.youtube.com/watch?v=KLs_7b7SKi4',
          duration: '16:28',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-5-3',
          title: 'Binomial Distribution - Full Tutorial',
          url: 'https://www.youtube.com/watch?v=J8jNoF-K8E8',
          duration: '22:14',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-5-4',
          title: 'Geometric Distribution Explained',
          url: 'https://www.youtube.com/watch?v=zq9Oz82iHf0',
          duration: '14:55',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'stat-sampling-distributions',
      name: 'Sampling Distributions',
      keywords: ['sampling distribution', 'central limit theorem', 'CLT', 'sample mean', 'sample proportion', 'standard error'],
      videos: [
        {
          id: 'stat-6-1',
          title: 'Sampling Distributions Introduction',
          url: 'https://www.youtube.com/watch?v=z0Ry_3_qhDw',
          duration: '11:32',
          channel: 'Khan Academy',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-6-2',
          title: 'Central Limit Theorem - Intuition',
          url: 'https://www.youtube.com/watch?v=JNm3M9cqWyc',
          duration: '10:45',
          channel: '3Blue1Brown',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'stat-6-3',
          title: 'Sampling Distribution of Sample Means',
          url: 'https://www.youtube.com/watch?v=FXZ2O1Lv-KE',
          duration: '18:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-6-4',
          title: 'Sampling Distribution of Sample Proportions',
          url: 'https://www.youtube.com/watch?v=fuGwbG9_W1c',
          duration: '15:47',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'stat-confidence-intervals',
      name: 'Confidence Intervals',
      keywords: ['confidence interval', 'margin of error', 'confidence level', 't-interval', 'z-interval', 'proportion interval'],
      videos: [
        {
          id: 'stat-7-1',
          title: 'Confidence Intervals - The Basics',
          url: 'https://www.youtube.com/watch?v=27iSnzss2wM',
          duration: '14:33',
          channel: 'Khan Academy',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-7-2',
          title: 'Confidence Interval for a Mean (Z and T)',
          url: 'https://www.youtube.com/watch?v=s4SRdaTycaw',
          duration: '21:15',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-7-3',
          title: 'Confidence Interval for a Proportion',
          url: 'https://www.youtube.com/watch?v=SeQeYVJZ2gE',
          duration: '16:42',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-7-4',
          title: 'Interpreting Confidence Intervals',
          url: 'https://www.youtube.com/watch?v=tFWsuO9f74o',
          duration: '9:28',
          channel: 'Khan Academy',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'stat-hypothesis-testing',
      name: 'Hypothesis Testing',
      keywords: ['hypothesis test', 'null hypothesis', 'alternative hypothesis', 'p-value', 'significance level', 'type I error', 'type II error', 'power', 't-test', 'z-test'],
      videos: [
        {
          id: 'stat-8-1',
          title: 'Hypothesis Testing - Introduction',
          url: 'https://www.youtube.com/watch?v=0oc49DyA3hU',
          duration: '12:55',
          channel: 'Khan Academy',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-8-2',
          title: 'P-Value - What it Actually Means',
          url: 'https://www.youtube.com/watch?v=5Z9OIYA8He8',
          duration: '11:42',
          channel: 'StatQuest',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'stat-8-3',
          title: 'Hypothesis Test for a Mean - Full Example',
          url: 'https://www.youtube.com/watch?v=JQc3yx0-Q9E',
          duration: '19:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-8-4',
          title: 'Hypothesis Test for a Proportion',
          url: 'https://www.youtube.com/watch?v=76VruarGn2Q',
          duration: '17:21',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-8-5',
          title: 'Type I and Type II Errors Explained',
          url: 'https://www.youtube.com/watch?v=Hdbbx7DIweQ',
          duration: '13:44',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'stat-8-6',
          title: 'Power of a Hypothesis Test',
          url: 'https://www.youtube.com/watch?v=6_Cuz0QqRWc',
          duration: '15:18',
          channel: 'StatQuest',
          difficulty: 'advanced',
          type: 'concept'
        }
      ]
    },
    {
      id: 'stat-chi-square',
      name: 'Chi-Square Tests',
      keywords: ['chi-square', 'chi square', 'goodness of fit', 'independence', 'homogeneity', 'categorical', 'contingency table'],
      videos: [
        {
          id: 'stat-9-1',
          title: 'Chi-Square Test - Introduction',
          url: 'https://www.youtube.com/watch?v=WXPBoFDqNVk',
          duration: '12:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-9-2',
          title: 'Chi-Square Goodness of Fit Test',
          url: 'https://www.youtube.com/watch?v=2QeDRsxSF9M',
          duration: '16:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-9-3',
          title: 'Chi-Square Test for Independence',
          url: 'https://www.youtube.com/watch?v=hpWdDmgsIRE',
          duration: '18:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'stat-regression',
      name: 'Linear Regression',
      keywords: ['regression', 'correlation', 'scatter plot', 'least squares', 'slope', 'residual', 'r-squared', 'coefficient of determination', 'linear model'],
      videos: [
        {
          id: 'stat-10-1',
          title: 'Correlation and Scatterplots',
          url: 'https://www.youtube.com/watch?v=xTpHD5WLuoA',
          duration: '14:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'stat-10-2',
          title: 'Linear Regression - Least Squares Method',
          url: 'https://www.youtube.com/watch?v=PaFPbb66DxQ',
          duration: '17:55',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'stat-10-3',
          title: 'Interpreting Slope and Intercept',
          url: 'https://www.youtube.com/watch?v=zPG4NjIkCjc',
          duration: '11:33',
          channel: 'Khan Academy',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'stat-10-4',
          title: 'R-Squared and Coefficient of Determination',
          url: 'https://www.youtube.com/watch?v=lng4ZgConCM',
          duration: '13:28',
          channel: 'StatQuest',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'stat-10-5',
          title: 'Residuals and Residual Plots',
          url: 'https://www.youtube.com/watch?v=yMgFHbjbAW8',
          duration: '10:45',
          channel: 'Khan Academy',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    }
  ]
};

// ============================================================================
// AP BIOLOGY
// ============================================================================
const apBiology: Course = {
  id: 'ap-biology',
  name: 'AP Biology',
  topics: [
    {
      id: 'bio-biochemistry',
      name: 'Biochemistry',
      keywords: ['biochemistry', 'macromolecules', 'carbohydrates', 'proteins', 'lipids', 'nucleic acids', 'enzymes', 'organic molecules', 'monomers', 'polymers'],
      videos: [
        {
          id: 'bio-1-1',
          title: 'Biological Molecules - Overview',
          url: 'https://www.youtube.com/watch?v=H8WJ2KENlK0',
          duration: '13:42',
          channel: 'Amoeba Sisters',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'bio-1-2',
          title: 'Carbohydrates - Structure and Function',
          url: 'https://www.youtube.com/watch?v=_zm_DyD6FJ0',
          duration: '11:33',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-1-3',
          title: 'Protein Structure and Function',
          url: 'https://www.youtube.com/watch?v=2Jgb_DpaQhM',
          duration: '14:55',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-1-4',
          title: 'Enzymes - How They Work',
          url: 'https://www.youtube.com/watch?v=qgVFkRn8f10',
          duration: '12:22',
          channel: 'Amoeba Sisters',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-1-5',
          title: 'Lipids - Fats, Phospholipids, Steroids',
          url: 'https://www.youtube.com/watch?v=VGHD9e3yRIU',
          duration: '10:45',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'bio-cells',
      name: 'Cell Structure and Function',
      keywords: ['cell', 'organelles', 'membrane', 'nucleus', 'mitochondria', 'chloroplast', 'endoplasmic reticulum', 'golgi', 'prokaryote', 'eukaryote'],
      videos: [
        {
          id: 'bio-2-1',
          title: 'Inside the Cell - Tour of Organelles',
          url: 'https://www.youtube.com/watch?v=URUJD5NEXC8',
          duration: '15:33',
          channel: 'Amoeba Sisters',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'bio-2-2',
          title: 'Cell Membrane Structure and Function',
          url: 'https://www.youtube.com/watch?v=qBCVVszQQNs',
          duration: '12:18',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-2-3',
          title: 'Prokaryotic vs Eukaryotic Cells',
          url: 'https://www.youtube.com/watch?v=RQ-SMCmWB1s',
          duration: '9:45',
          channel: 'Amoeba Sisters',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'bio-2-4',
          title: 'Membrane Transport - Passive and Active',
          url: 'https://www.youtube.com/watch?v=Ptmlvtei8hw',
          duration: '14:22',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'bio-cellular-energetics',
      name: 'Cellular Energetics',
      keywords: ['ATP', 'photosynthesis', 'cellular respiration', 'glycolysis', 'krebs cycle', 'electron transport chain', 'fermentation', 'metabolism', 'light reactions', 'calvin cycle'],
      videos: [
        {
          id: 'bio-3-1',
          title: 'ATP and Cellular Energy',
          url: 'https://www.youtube.com/watch?v=00jbG_cfGuQ',
          duration: '11:55',
          channel: 'Amoeba Sisters',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'bio-3-2',
          title: 'Photosynthesis - Light Reactions',
          url: 'https://www.youtube.com/watch?v=GR2GA7chA_c',
          duration: '15:33',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-3-3',
          title: 'Photosynthesis - Calvin Cycle',
          url: 'https://www.youtube.com/watch?v=slm6D2VEXYs',
          duration: '12:45',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-3-4',
          title: 'Cellular Respiration Overview',
          url: 'https://www.youtube.com/watch?v=eJ9Zjc-jdys',
          duration: '13:22',
          channel: 'Amoeba Sisters',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'bio-3-5',
          title: 'Glycolysis and Krebs Cycle',
          url: 'https://www.youtube.com/watch?v=Gh2P5CmCC0M',
          duration: '16:42',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-3-6',
          title: 'Electron Transport Chain',
          url: 'https://www.youtube.com/watch?v=rdF3mnyS1p0',
          duration: '14:18',
          channel: 'Bozeman Science',
          difficulty: 'advanced',
          type: 'concept'
        }
      ]
    },
    {
      id: 'bio-cell-cycle',
      name: 'Cell Division',
      keywords: ['mitosis', 'meiosis', 'cell cycle', 'interphase', 'prophase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis', 'chromosome', 'crossing over'],
      videos: [
        {
          id: 'bio-4-1',
          title: 'Cell Cycle and Mitosis',
          url: 'https://www.youtube.com/watch?v=f-ldPgEfAHI',
          duration: '12:33',
          channel: 'Amoeba Sisters',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'bio-4-2',
          title: 'Mitosis - Detailed Walkthrough',
          url: 'https://www.youtube.com/watch?v=L0k-enzoeOM',
          duration: '15:22',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-4-3',
          title: 'Meiosis - The Key Steps',
          url: 'https://www.youtube.com/watch?v=qCLmR9-YY7o',
          duration: '14:45',
          channel: 'Amoeba Sisters',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-4-4',
          title: 'Comparing Mitosis and Meiosis',
          url: 'https://www.youtube.com/watch?v=IQJ4DBkCnco',
          duration: '10:18',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'bio-genetics',
      name: 'Heredity and Genetics',
      keywords: ['genetics', 'heredity', 'mendel', 'allele', 'genotype', 'phenotype', 'punnett square', 'dominant', 'recessive', 'inheritance', 'dihybrid', 'monohybrid'],
      videos: [
        {
          id: 'bio-5-1',
          title: 'Mendelian Genetics - Introduction',
          url: 'https://www.youtube.com/watch?v=CBezq1fFUEA',
          duration: '13:22',
          channel: 'Amoeba Sisters',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'bio-5-2',
          title: 'Punnett Squares - Monohybrid Cross',
          url: 'https://www.youtube.com/watch?v=Y1PCwxUBJFE',
          duration: '11:45',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'bio-5-3',
          title: 'Dihybrid Crosses and Independent Assortment',
          url: 'https://www.youtube.com/watch?v=D5ymMYcLtv0',
          duration: '14:33',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'bio-5-4',
          title: 'Non-Mendelian Genetics',
          url: 'https://www.youtube.com/watch?v=YJHGfbW55l0',
          duration: '12:18',
          channel: 'Amoeba Sisters',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'bio-molecular-genetics',
      name: 'Molecular Genetics',
      keywords: ['DNA', 'RNA', 'replication', 'transcription', 'translation', 'gene expression', 'mutation', 'codon', 'anticodon', 'central dogma', 'protein synthesis'],
      videos: [
        {
          id: 'bio-6-1',
          title: 'DNA Structure and Replication',
          url: 'https://www.youtube.com/watch?v=8kK2zwjRV0M',
          duration: '14:22',
          channel: 'Amoeba Sisters',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'bio-6-2',
          title: 'DNA Replication - Detailed Mechanism',
          url: 'https://www.youtube.com/watch?v=I9ArIJWYZHI',
          duration: '16:33',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-6-3',
          title: 'Transcription and mRNA Processing',
          url: 'https://www.youtube.com/watch?v=JQIgMhDpOHE',
          duration: '13:45',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-6-4',
          title: 'Translation - Protein Synthesis',
          url: 'https://www.youtube.com/watch?v=TfYf_rPWUdY',
          duration: '12:55',
          channel: 'Amoeba Sisters',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-6-5',
          title: 'Gene Regulation in Prokaryotes',
          url: 'https://www.youtube.com/watch?v=oBwtxdI1zvk',
          duration: '15:22',
          channel: 'Bozeman Science',
          difficulty: 'advanced',
          type: 'concept'
        }
      ]
    },
    {
      id: 'bio-evolution',
      name: 'Evolution',
      keywords: ['evolution', 'natural selection', 'adaptation', 'speciation', 'genetic drift', 'gene flow', 'hardy-weinberg', 'fitness', 'darwin', 'evidence for evolution'],
      videos: [
        {
          id: 'bio-7-1',
          title: 'Natural Selection - Introduction',
          url: 'https://www.youtube.com/watch?v=7VM9YxmULuo',
          duration: '13:55',
          channel: 'Amoeba Sisters',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'bio-7-2',
          title: 'Evidence for Evolution',
          url: 'https://www.youtube.com/watch?v=lIEoO5KdPvg',
          duration: '11:42',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-7-3',
          title: 'Hardy-Weinberg Equilibrium',
          url: 'https://www.youtube.com/watch?v=xPkOAnK20kw',
          duration: '14:33',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'bio-7-4',
          title: 'Speciation - How New Species Form',
          url: 'https://www.youtube.com/watch?v=2oKlKmrbLoU',
          duration: '12:18',
          channel: 'Amoeba Sisters',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'bio-ecology',
      name: 'Ecology',
      keywords: ['ecology', 'ecosystem', 'food web', 'energy flow', 'trophic levels', 'population', 'community', 'biome', 'carbon cycle', 'nitrogen cycle', 'biodiversity'],
      videos: [
        {
          id: 'bio-8-1',
          title: 'Ecosystems and Energy Flow',
          url: 'https://www.youtube.com/watch?v=v6ubvEJ3KGM',
          duration: '14:22',
          channel: 'Amoeba Sisters',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'bio-8-2',
          title: 'Food Webs and Trophic Levels',
          url: 'https://www.youtube.com/watch?v=Vtb3I8Vzlfg',
          duration: '11:55',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-8-3',
          title: 'Population Ecology',
          url: 'https://www.youtube.com/watch?v=RBOsqmBQBQk',
          duration: '13:33',
          channel: 'Bozeman Science',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'bio-8-4',
          title: 'Biogeochemical Cycles - Carbon and Nitrogen',
          url: 'https://www.youtube.com/watch?v=2D7hZpIYlCA',
          duration: '15:42',
          channel: 'Amoeba Sisters',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    }
  ]
};

// ============================================================================
// AP CALCULUS AB/BC
// ============================================================================
const apCalculus: Course = {
  id: 'ap-calculus',
  name: 'AP Calculus AB/BC',
  topics: [
    {
      id: 'calc-limits',
      name: 'Limits and Continuity',
      keywords: ['limit', 'continuity', 'asymptote', 'infinite limit', 'limit at infinity', 'squeeze theorem', 'intermediate value theorem', 'IVT'],
      videos: [
        {
          id: 'calc-1-1',
          title: 'Introduction to Limits',
          url: 'https://www.youtube.com/watch?v=riXcZT2ICjA',
          duration: '18:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'calc-1-2',
          title: 'Limits Graphically and Numerically',
          url: 'https://www.youtube.com/watch?v=YNstP0ESndU',
          duration: '14:55',
          channel: '3Blue1Brown',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'calc-1-3',
          title: 'Evaluating Limits Algebraically',
          url: 'https://www.youtube.com/watch?v=HfACrKJ_Y2w',
          duration: '21:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'calc-1-4',
          title: 'Limits at Infinity',
          url: 'https://www.youtube.com/watch?v=Ll2wgPQkh1Q',
          duration: '16:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'calc-1-5',
          title: 'Continuity and Discontinuity',
          url: 'https://www.youtube.com/watch?v=joewRl1CTL8',
          duration: '15:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'calc-derivatives',
      name: 'Derivatives',
      keywords: ['derivative', 'differentiation', 'rate of change', 'tangent line', 'power rule', 'product rule', 'quotient rule', 'chain rule'],
      videos: [
        {
          id: 'calc-2-1',
          title: 'The Essence of Calculus - Derivatives',
          url: 'https://www.youtube.com/watch?v=9vKqVkMQHKk',
          duration: '17:04',
          channel: '3Blue1Brown',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'calc-2-2',
          title: 'Power Rule for Derivatives',
          url: 'https://www.youtube.com/watch?v=4q8a6bujcGo',
          duration: '14:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'calc-2-3',
          title: 'Product Rule and Quotient Rule',
          url: 'https://www.youtube.com/watch?v=YG15m2VwSjA',
          duration: '18:45',
          channel: 'Professor Leonard',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'calc-2-4',
          title: 'Chain Rule - Intuition and Examples',
          url: 'https://www.youtube.com/watch?v=H-ybCx8gt-8',
          duration: '16:22',
          channel: '3Blue1Brown',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'calc-2-5',
          title: 'Chain Rule - Practice Problems',
          url: 'https://www.youtube.com/watch?v=HaHsqDjWMLU',
          duration: '22:18',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'practice'
        }
      ]
    },
    {
      id: 'calc-applications-derivatives',
      name: 'Applications of Derivatives',
      keywords: ['related rates', 'optimization', 'maxima', 'minima', 'critical points', 'first derivative test', 'second derivative test', 'concavity', 'inflection point'],
      videos: [
        {
          id: 'calc-3-1',
          title: 'Related Rates - Introduction',
          url: 'https://www.youtube.com/watch?v=I9mVUo-bhM8',
          duration: '19:55',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'calc-3-2',
          title: 'Optimization Problems',
          url: 'https://www.youtube.com/watch?v=pJTgAtLH7Hw',
          duration: '21:33',
          channel: 'Professor Leonard',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'calc-3-3',
          title: 'First and Second Derivative Tests',
          url: 'https://www.youtube.com/watch?v=lDY9JcFaRd4',
          duration: '17:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'calc-3-4',
          title: 'Curve Sketching with Calculus',
          url: 'https://www.youtube.com/watch?v=MUQfl385Yug',
          duration: '23:45',
          channel: 'Professor Leonard',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'calc-integrals',
      name: 'Integrals',
      keywords: ['integral', 'antiderivative', 'integration', 'definite integral', 'indefinite integral', 'fundamental theorem', 'area under curve', 'riemann sum'],
      videos: [
        {
          id: 'calc-4-1',
          title: 'Integration and the Fundamental Theorem',
          url: 'https://www.youtube.com/watch?v=rfG8ce4nNh0',
          duration: '20:14',
          channel: '3Blue1Brown',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'calc-4-2',
          title: 'Basic Integration Rules',
          url: 'https://www.youtube.com/watch?v=gmSgNBTMuGM',
          duration: '18:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'calc-4-3',
          title: 'U-Substitution',
          url: 'https://www.youtube.com/watch?v=oHdMPgLhyuo',
          duration: '22:45',
          channel: 'Professor Leonard',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'calc-4-4',
          title: 'Definite Integrals and Area',
          url: 'https://www.youtube.com/watch?v=ngUe1yeYyBs',
          duration: '19:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'calc-applications-integrals',
      name: 'Applications of Integrals',
      keywords: ['area between curves', 'volume', 'disk method', 'washer method', 'shell method', 'arc length', 'average value'],
      videos: [
        {
          id: 'calc-5-1',
          title: 'Area Between Curves',
          url: 'https://www.youtube.com/watch?v=DIcP6h0aaig',
          duration: '17:55',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'calc-5-2',
          title: 'Volumes by Disk and Washer Method',
          url: 'https://www.youtube.com/watch?v=BXBRGxvVlnI',
          duration: '21:33',
          channel: 'Professor Leonard',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'calc-5-3',
          title: 'Shell Method for Volumes',
          url: 'https://www.youtube.com/watch?v=SuCY4GAzBsw',
          duration: '18:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'calc-differential-equations',
      name: 'Differential Equations',
      keywords: ['differential equation', 'slope field', 'separation of variables', 'initial condition', 'particular solution', 'general solution'],
      videos: [
        {
          id: 'calc-6-1',
          title: 'Introduction to Differential Equations',
          url: 'https://www.youtube.com/watch?v=p_di4Zn4wz4',
          duration: '16:33',
          channel: '3Blue1Brown',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'calc-6-2',
          title: 'Slope Fields',
          url: 'https://www.youtube.com/watch?v=rHVY-VpXJzs',
          duration: '14:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'calc-6-3',
          title: 'Separation of Variables',
          url: 'https://www.youtube.com/watch?v=VXHGaxJzbQI',
          duration: '19:55',
          channel: 'Professor Leonard',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    }
  ]
};

// ============================================================================
// AP PHYSICS 1
// ============================================================================
const apPhysics1: Course = {
  id: 'ap-physics-1',
  name: 'AP Physics 1',
  topics: [
    {
      id: 'phys-kinematics',
      name: 'Kinematics',
      keywords: ['kinematics', 'motion', 'velocity', 'acceleration', 'displacement', 'projectile', 'free fall', 'equations of motion'],
      videos: [
        {
          id: 'phys-1-1',
          title: 'One-Dimensional Kinematics',
          url: 'https://www.youtube.com/watch?v=xQ4znShlK5A',
          duration: '16:42',
          channel: 'Flipping Physics',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'phys-1-2',
          title: 'Kinematic Equations - Problem Solving',
          url: 'https://www.youtube.com/watch?v=v1V3T5BPd7E',
          duration: '19:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-1-3',
          title: 'Projectile Motion',
          url: 'https://www.youtube.com/watch?v=js2wErEsij4',
          duration: '18:22',
          channel: 'Flipping Physics',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-1-4',
          title: 'Free Fall Problems',
          url: 'https://www.youtube.com/watch?v=KkpqA8yToCs',
          duration: '15:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'phys-dynamics',
      name: 'Dynamics (Forces)',
      keywords: ['force', 'newton', 'dynamics', 'friction', 'normal force', 'tension', 'free body diagram', 'FBD', 'net force', 'F=ma'],
      videos: [
        {
          id: 'phys-2-1',
          title: "Newton's Laws of Motion",
          url: 'https://www.youtube.com/watch?v=kKKM8Y-u7ds',
          duration: '14:55',
          channel: 'Crash Course Physics',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'phys-2-2',
          title: 'Free Body Diagrams',
          url: 'https://www.youtube.com/watch?v=r5DLKFR4Xqw',
          duration: '16:33',
          channel: 'Flipping Physics',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'phys-2-3',
          title: 'Friction Force Problems',
          url: 'https://www.youtube.com/watch?v=fo_pmp5rtzo',
          duration: '21:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-2-4',
          title: 'Tension and Pulley Problems',
          url: 'https://www.youtube.com/watch?v=VNPILLwTYYg',
          duration: '18:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-2-5',
          title: 'Inclined Plane Problems',
          url: 'https://www.youtube.com/watch?v=EMdXf9L_5c4',
          duration: '19:55',
          channel: 'Flipping Physics',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'phys-circular-motion',
      name: 'Circular Motion and Gravitation',
      keywords: ['circular motion', 'centripetal', 'centrifugal', 'gravitation', 'orbit', 'satellite', 'angular velocity', 'radial acceleration'],
      videos: [
        {
          id: 'phys-3-1',
          title: 'Uniform Circular Motion',
          url: 'https://www.youtube.com/watch?v=bpFK2VCRHUs',
          duration: '15:33',
          channel: 'Flipping Physics',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'phys-3-2',
          title: 'Centripetal Force Problems',
          url: 'https://www.youtube.com/watch?v=Y1MZAP-P6cc',
          duration: '19:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-3-3',
          title: 'Universal Gravitation',
          url: 'https://www.youtube.com/watch?v=7gf6YpdvtE0',
          duration: '17:45',
          channel: 'Crash Course Physics',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'phys-energy',
      name: 'Energy and Work',
      keywords: ['energy', 'work', 'kinetic energy', 'potential energy', 'conservation of energy', 'power', 'work-energy theorem', 'spring'],
      videos: [
        {
          id: 'phys-4-1',
          title: 'Work and Energy - Introduction',
          url: 'https://www.youtube.com/watch?v=w4QFJb9a8vo',
          duration: '15:22',
          channel: 'Crash Course Physics',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'phys-4-2',
          title: 'Work-Energy Theorem Problems',
          url: 'https://www.youtube.com/watch?v=4iXYz7mHWKg',
          duration: '18:55',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-4-3',
          title: 'Conservation of Energy',
          url: 'https://www.youtube.com/watch?v=LfSYUQPh3Lk',
          duration: '16:33',
          channel: 'Flipping Physics',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-4-4',
          title: 'Spring Potential Energy',
          url: 'https://www.youtube.com/watch?v=dpPFDOzBsdk',
          duration: '14:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'phys-momentum',
      name: 'Momentum and Impulse',
      keywords: ['momentum', 'impulse', 'collision', 'elastic', 'inelastic', 'conservation of momentum', 'center of mass'],
      videos: [
        {
          id: 'phys-5-1',
          title: 'Momentum and Impulse',
          url: 'https://www.youtube.com/watch?v=XFhntPxow0U',
          duration: '14:33',
          channel: 'Crash Course Physics',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'phys-5-2',
          title: 'Impulse-Momentum Theorem',
          url: 'https://www.youtube.com/watch?v=WVr-1nTVjqU',
          duration: '17:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-5-3',
          title: 'Conservation of Momentum - Collisions',
          url: 'https://www.youtube.com/watch?v=Y-QOfc2XqOk',
          duration: '19:55',
          channel: 'Flipping Physics',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-5-4',
          title: 'Elastic vs Inelastic Collisions',
          url: 'https://www.youtube.com/watch?v=cPNqw8sOjLo',
          duration: '16:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'phys-rotation',
      name: 'Rotational Motion',
      keywords: ['rotation', 'torque', 'angular momentum', 'moment of inertia', 'rotational kinetic energy', 'angular acceleration'],
      videos: [
        {
          id: 'phys-6-1',
          title: 'Introduction to Torque',
          url: 'https://www.youtube.com/watch?v=3S85TCvJWW4',
          duration: '15:22',
          channel: 'Flipping Physics',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'phys-6-2',
          title: 'Torque Problems',
          url: 'https://www.youtube.com/watch?v=JKvpwHZHoEA',
          duration: '18:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-6-3',
          title: 'Angular Momentum',
          url: 'https://www.youtube.com/watch?v=t8u3iJSBLMs',
          duration: '14:55',
          channel: 'Crash Course Physics',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'phys-waves',
      name: 'Simple Harmonic Motion and Waves',
      keywords: ['wave', 'harmonic motion', 'oscillation', 'pendulum', 'spring', 'frequency', 'amplitude', 'wavelength', 'period'],
      videos: [
        {
          id: 'phys-7-1',
          title: 'Simple Harmonic Motion',
          url: 'https://www.youtube.com/watch?v=Ao4MkuUo3nA',
          duration: '16:33',
          channel: 'Flipping Physics',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'phys-7-2',
          title: 'Mass-Spring Systems',
          url: 'https://www.youtube.com/watch?v=8HrKJML-cOo',
          duration: '17:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-7-3',
          title: 'Pendulum Motion',
          url: 'https://www.youtube.com/watch?v=1p7gylCQXVo',
          duration: '14:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'phys-7-4',
          title: 'Wave Properties and Types',
          url: 'https://www.youtube.com/watch?v=TfYCnOvNnFU',
          duration: '13:55',
          channel: 'Crash Course Physics',
          difficulty: 'intro',
          type: 'concept'
        }
      ]
    }
  ]
};

// ============================================================================
// AP CHEMISTRY
// ============================================================================
const apChemistry: Course = {
  id: 'ap-chemistry',
  name: 'AP Chemistry',
  topics: [
    {
      id: 'chem-atomic-structure',
      name: 'Atomic Structure',
      keywords: ['atom', 'electron', 'proton', 'neutron', 'orbital', 'electron configuration', 'quantum numbers', 'periodic trends'],
      videos: [
        {
          id: 'chem-1-1',
          title: 'Atomic Structure - Subatomic Particles',
          url: 'https://www.youtube.com/watch?v=ULoexCgYC_I',
          duration: '12:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'chem-1-2',
          title: 'Electron Configuration',
          url: 'https://www.youtube.com/watch?v=Aoi4j8es4gQ',
          duration: '18:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-1-3',
          title: 'Periodic Trends',
          url: 'https://www.youtube.com/watch?v=1Y9BgNXEwqY',
          duration: '16:22',
          channel: 'Tyler DeWitt',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'chem-bonding',
      name: 'Chemical Bonding',
      keywords: ['bond', 'ionic', 'covalent', 'metallic', 'lewis structure', 'VSEPR', 'molecular geometry', 'polarity', 'electronegativity'],
      videos: [
        {
          id: 'chem-2-1',
          title: 'Ionic vs Covalent Bonding',
          url: 'https://www.youtube.com/watch?v=Fr4sQS5bjT4',
          duration: '14:55',
          channel: 'Tyler DeWitt',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'chem-2-2',
          title: 'Lewis Structures - Step by Step',
          url: 'https://www.youtube.com/watch?v=1ZlnzyHahvo',
          duration: '19:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-2-3',
          title: 'VSEPR Theory and Molecular Geometry',
          url: 'https://www.youtube.com/watch?v=Moj86TfjBvw',
          duration: '21:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'chem-2-4',
          title: 'Molecular Polarity',
          url: 'https://www.youtube.com/watch?v=q3g3xphTMNA',
          duration: '15:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'concept'
        }
      ]
    },
    {
      id: 'chem-stoichiometry',
      name: 'Stoichiometry',
      keywords: ['stoichiometry', 'mole', 'molar mass', 'limiting reagent', 'percent yield', 'balancing equations', 'mole ratio'],
      videos: [
        {
          id: 'chem-3-1',
          title: 'The Mole Concept',
          url: 'https://www.youtube.com/watch?v=jFv6k2O4LHE',
          duration: '13:42',
          channel: 'Tyler DeWitt',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'chem-3-2',
          title: 'Molar Mass Calculations',
          url: 'https://www.youtube.com/watch?v=gHuN9HRQ-6M',
          duration: '11:55',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-3-3',
          title: 'Stoichiometry - Full Tutorial',
          url: 'https://www.youtube.com/watch?v=eQf_EAYGo-k',
          duration: '24:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-3-4',
          title: 'Limiting Reagent Problems',
          url: 'https://www.youtube.com/watch?v=rESzyhPOJ7I',
          duration: '18:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'chem-gases',
      name: 'Gases',
      keywords: ['gas', 'pressure', 'ideal gas law', 'PV=nRT', 'gas laws', 'Boyle', 'Charles', 'Dalton', 'partial pressure'],
      videos: [
        {
          id: 'chem-4-1',
          title: 'Introduction to Gas Laws',
          url: 'https://www.youtube.com/watch?v=FuJx8S_ysLg',
          duration: '14:33',
          channel: 'Tyler DeWitt',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'chem-4-2',
          title: 'Ideal Gas Law Problems',
          url: 'https://www.youtube.com/watch?v=TqLlfHBFY08',
          duration: '21:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-4-3',
          title: "Dalton's Law of Partial Pressures",
          url: 'https://www.youtube.com/watch?v=yLv-ezBnMuY',
          duration: '15:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'chem-thermodynamics',
      name: 'Thermodynamics',
      keywords: ['thermodynamics', 'enthalpy', 'entropy', 'gibbs free energy', 'heat', 'exothermic', 'endothermic', "Hess's law", 'calorimetry'],
      videos: [
        {
          id: 'chem-5-1',
          title: 'Introduction to Thermodynamics',
          url: 'https://www.youtube.com/watch?v=JnELsA7rX6A',
          duration: '16:55',
          channel: 'Crash Course Chemistry',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'chem-5-2',
          title: 'Enthalpy and Calorimetry',
          url: 'https://www.youtube.com/watch?v=WKwjr0SpQvg',
          duration: '19:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-5-3',
          title: "Hess's Law",
          url: 'https://www.youtube.com/watch?v=8bCL5VmqYSs',
          duration: '17:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-5-4',
          title: 'Gibbs Free Energy',
          url: 'https://www.youtube.com/watch?v=ViAmQivKif0',
          duration: '18:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'advanced',
          type: 'concept'
        }
      ]
    },
    {
      id: 'chem-equilibrium',
      name: 'Chemical Equilibrium',
      keywords: ['equilibrium', 'equilibrium constant', 'Le Chatelier', 'Kc', 'Kp', 'ICE table', 'reaction quotient'],
      videos: [
        {
          id: 'chem-6-1',
          title: 'Chemical Equilibrium Basics',
          url: 'https://www.youtube.com/watch?v=dUMmoPdwBy4',
          duration: '15:42',
          channel: 'Tyler DeWitt',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'chem-6-2',
          title: 'Equilibrium Constant Calculations',
          url: 'https://www.youtube.com/watch?v=_E4THT04V4E',
          duration: '22:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-6-3',
          title: "Le Chatelier's Principle",
          url: 'https://www.youtube.com/watch?v=dtnvmFXvMwA',
          duration: '14:55',
          channel: 'Tyler DeWitt',
          difficulty: 'standard',
          type: 'concept'
        },
        {
          id: 'chem-6-4',
          title: 'ICE Table Problems',
          url: 'https://www.youtube.com/watch?v=8SBNfJqGLec',
          duration: '19:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'chem-acids-bases',
      name: 'Acids and Bases',
      keywords: ['acid', 'base', 'pH', 'pOH', 'buffer', 'titration', 'Ka', 'Kb', 'conjugate acid', 'conjugate base', 'neutralization'],
      videos: [
        {
          id: 'chem-7-1',
          title: 'Introduction to Acids and Bases',
          url: 'https://www.youtube.com/watch?v=ANi709MYnWg',
          duration: '14:33',
          channel: 'Tyler DeWitt',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'chem-7-2',
          title: 'pH and pOH Calculations',
          url: 'https://www.youtube.com/watch?v=qqRjv1NChLo',
          duration: '18:45',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-7-3',
          title: 'Weak Acid and Base Equilibria',
          url: 'https://www.youtube.com/watch?v=3D1LpxPn-D0',
          duration: '21:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-7-4',
          title: 'Buffers and Henderson-Hasselbalch',
          url: 'https://www.youtube.com/watch?v=XXb8JOFm0AA',
          duration: '19:55',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'advanced',
          type: 'worked-example'
        }
      ]
    },
    {
      id: 'chem-kinetics',
      name: 'Chemical Kinetics',
      keywords: ['kinetics', 'reaction rate', 'rate law', 'order', 'half-life', 'activation energy', 'catalyst', 'rate constant'],
      videos: [
        {
          id: 'chem-8-1',
          title: 'Reaction Rates Introduction',
          url: 'https://www.youtube.com/watch?v=OttRV5ykP7A',
          duration: '13:42',
          channel: 'Crash Course Chemistry',
          difficulty: 'intro',
          type: 'concept'
        },
        {
          id: 'chem-8-2',
          title: 'Rate Law and Rate Constants',
          url: 'https://www.youtube.com/watch?v=wYqQCPWWTxk',
          duration: '20:33',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-8-3',
          title: 'Integrated Rate Laws',
          url: 'https://www.youtube.com/watch?v=jJq1Qw7LGIY',
          duration: '18:22',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'standard',
          type: 'worked-example'
        },
        {
          id: 'chem-8-4',
          title: 'Activation Energy and Arrhenius Equation',
          url: 'https://www.youtube.com/watch?v=aN8w4GnGJVw',
          duration: '16:55',
          channel: 'The Organic Chemistry Tutor',
          difficulty: 'advanced',
          type: 'concept'
        }
      ]
    }
  ]
};

// ============================================================================
// ALL COURSES
// ============================================================================
export const videoLibrary: Course[] = [
  apStatistics,
  apBiology,
  apCalculus,
  apPhysics1,
  apChemistry
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Find videos for a given topic based on keyword matching
 */
export function findVideosForTopic(
  courseName: string,
  topicText: string
): Video[] {
  // Normalize input
  const normalizedCourse = courseName.toLowerCase();
  const normalizedTopic = topicText.toLowerCase();

  // Find the course
  const course = videoLibrary.find(c =>
    normalizedCourse.includes(c.name.toLowerCase().replace('ap ', '')) ||
    c.name.toLowerCase().includes(normalizedCourse.replace('ap ', ''))
  );

  if (!course) {
    return [];
  }

  // Find matching topics by keyword
  const matchingTopics: Topic[] = [];

  for (const topic of course.topics) {
    // Check if any keywords match the topic text
    const keywordMatch = topic.keywords.some(kw =>
      normalizedTopic.includes(kw.toLowerCase())
    );

    // Also check if the topic name matches
    const nameMatch = normalizedTopic.includes(topic.name.toLowerCase()) ||
      topic.name.toLowerCase().includes(normalizedTopic);

    if (keywordMatch || nameMatch) {
      matchingTopics.push(topic);
    }
  }

  // Collect all videos from matching topics
  const videos: Video[] = [];
  const seenIds = new Set<string>();

  for (const topic of matchingTopics) {
    for (const video of topic.videos) {
      if (!seenIds.has(video.id)) {
        seenIds.add(video.id);
        videos.push(video);
      }
    }
  }

  // Sort: intro first, then by type (concept → worked-example → practice)
  const typeOrder = { 'concept': 0, 'worked-example': 1, 'practice': 2, 'review': 3 };
  const difficultyOrder = { 'intro': 0, 'standard': 1, 'advanced': 2 };

  videos.sort((a, b) => {
    const diffA = difficultyOrder[a.difficulty];
    const diffB = difficultyOrder[b.difficulty];
    if (diffA !== diffB) return diffA - diffB;

    const typeA = typeOrder[a.type];
    const typeB = typeOrder[b.type];
    return typeA - typeB;
  });

  return videos;
}

/**
 * Get a learning path (ordered videos) for a topic
 */
export function getLearningPath(
  courseName: string,
  topicText: string,
  maxVideos: number = 5
): { learn: Video[]; practice: Video[]; review: Video[] } {
  const videos = findVideosForTopic(courseName, topicText);

  const learn: Video[] = [];
  const practice: Video[] = [];
  const review: Video[] = [];

  for (const video of videos) {
    if (video.type === 'concept' && learn.length < maxVideos) {
      learn.push(video);
    } else if (video.type === 'worked-example' && practice.length < maxVideos) {
      practice.push(video);
    } else if ((video.type === 'practice' || video.type === 'review') && review.length < maxVideos) {
      review.push(video);
    }
  }

  return { learn, practice, review };
}

/**
 * Get all topics for a course
 */
export function getCourseTopics(courseName: string): Topic[] {
  const normalizedCourse = courseName.toLowerCase();

  const course = videoLibrary.find(c =>
    normalizedCourse.includes(c.name.toLowerCase().replace('ap ', '')) ||
    c.name.toLowerCase().includes(normalizedCourse.replace('ap ', ''))
  );

  return course?.topics || [];
}

/**
 * Check if we have videos for a course
 */
export function hasCourseVideos(courseName: string): boolean {
  const normalizedCourse = courseName.toLowerCase();

  return videoLibrary.some(c =>
    normalizedCourse.includes(c.name.toLowerCase().replace('ap ', '')) ||
    c.name.toLowerCase().includes(normalizedCourse.replace('ap ', ''))
  );
}
