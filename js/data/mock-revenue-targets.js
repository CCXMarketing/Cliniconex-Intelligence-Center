export const data = {
  scenarios: {
    threshold: {
      annual: 9600000,
      ebitda: 1100000,
      monthly: {
        jan: { eom_mrr: 710084,  gross_needed: 32039, churn_budget: -6849 },
        feb: { eom_mrr: 733175,  gross_needed: 30192, churn_budget: -7101 },
        mar: { eom_mrr: 756266,  gross_needed: 30423, churn_budget: -7332 },
        apr: { eom_mrr: 777258,  gross_needed: 28555, churn_budget: -7563 },
        may: { eom_mrr: 796151,  gross_needed: 26666, churn_budget: -7773 },
        jun: { eom_mrr: 810845,  gross_needed: 22656, churn_budget: -7962 },
        jul: { eom_mrr: 821341,  gross_needed: 18604, churn_budget: -8108 },
        aug: { eom_mrr: 825539,  gross_needed: 12411, churn_budget: -8213 },
        sep: { eom_mrr: 836035,  gross_needed: 18751, churn_budget: -8255 },
        oct: { eom_mrr: 842333,  gross_needed: 14658, churn_budget: -8360 },
        nov: { eom_mrr: 844432,  gross_needed: 10522, churn_budget: -8423 },
        dec: { eom_mrr: 846541,  gross_needed: 10553, churn_budget: -8444 }
      }
    },
    target: {
      annual: 10000000,
      ebitda: 1100000,
      monthly: {
        jan: { eom_mrr: 717379,  gross_needed: 39334, churn_budget: -6849 },
        feb: { eom_mrr: 747157,  gross_needed: 36952, churn_budget: -7174 },
        mar: { eom_mrr: 776935,  gross_needed: 37250, churn_budget: -7472 },
        apr: { eom_mrr: 804006,  gross_needed: 34840, churn_budget: -7769 },
        may: { eom_mrr: 828370,  gross_needed: 32404, churn_budget: -8040 },
        jun: { eom_mrr: 847320,  gross_needed: 27234, churn_budget: -8284 },
        jul: { eom_mrr: 860856,  gross_needed: 22009, churn_budget: -8473 },
        aug: { eom_mrr: 866270,  gross_needed: 14023, churn_budget: -8609 },
        sep: { eom_mrr: 879806,  gross_needed: 22199, churn_budget: -8663 },
        oct: { eom_mrr: 887927,  gross_needed: 16919, churn_budget: -8798 },
        nov: { eom_mrr: 890634,  gross_needed: 11586, churn_budget: -8879 },
        dec: { eom_mrr: 893340,  gross_needed: 11612, churn_budget: -8906 }
      }
    },
    overachieve: {
      annual: 10400000,
      ebitda: 1100000,
      monthly: {
        jan: { eom_mrr: 724674,  gross_needed: 46629, churn_budget: -6849 },
        feb: { eom_mrr: 761139,  gross_needed: 43712, churn_budget: -7247 },
        mar: { eom_mrr: 797604,  gross_needed: 44076, churn_budget: -7611 },
        apr: { eom_mrr: 830754,  gross_needed: 41126, churn_budget: -7976 },
        may: { eom_mrr: 860589,  gross_needed: 38143, churn_budget: -8308 },
        jun: { eom_mrr: 883794,  gross_needed: 31811, churn_budget: -8606 },
        jul: { eom_mrr: 900369,  gross_needed: 25413, churn_budget: -8838 },
        aug: { eom_mrr: 906999,  gross_needed: 15634, churn_budget: -9004 },
        sep: { eom_mrr: 923574,  gross_needed: 25645, churn_budget: -9070 },
        oct: { eom_mrr: 933519,  gross_needed: 19181, churn_budget: -9236 },
        nov: { eom_mrr: 936834,  gross_needed: 12650, churn_budget: -9335 },
        dec: { eom_mrr: 940151,  gross_needed: 12685, churn_budget: -9368 }
      }
    }
  },
  months_ordered: ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
  month_labels:   ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  current_month:  'mar',
  current_month_index: 2,
  current_year:   2026
};
