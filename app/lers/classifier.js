import Dataset from './dataset';
import Ruleset from './ruleset';
const info = console.info;

/**
 * An LERS based classifier system.
 *
 * @class Classifier
 */
export default class Classifier {

  /**
   * Constructor for Classifier.
   *
   * @function constructor
   * @param {string[]} inputRuleFile
   * @param {string[]} inputDataFile
   * @param {boolean} shouldUseMatchingFactor
   * @param {boolean} shouldUseConditionalProbability
   * @param {boolean} shouldUseSpecificityReturnFactor
   * @param {boolean} shouldUseSupportFromOtherRules
   */
  constructor (
      inputRuleFile = [],
      inputDataFile = [],
      shouldUseMatchingFactor = true,
      shouldUseConditionalProbability = true,
      shouldUseSpecificityReturnFactor = true,
      shouldUseSupportFromOtherRules = true
  ) {
    this.ruleset = new Ruleset(inputRuleFile);
    this.dataset = new Dataset(inputDataFile);
    this.shouldUseMatchingFactor = shouldUseMatchingFactor;
    this.shouldUseConditionalProbability = shouldUseConditionalProbability;
    this.shouldUseSpecificityReturnFactor = shouldUseSpecificityReturnFactor;
    this.shouldUseSupportFromOtherRules = shouldUseSupportFromOtherRules;
    this.matchedCases = {};
    this.generalStatistics = {};

    if (this.shouldUseConditionalProbability && this.ruleset.hasRulesWithZeroMatchingCases) {
      info('*** The Rule Set has a Rule with zero matching cases. Hence, conditional probability cannot be used. Using strength instead. ***');
      info('\n\n');
    }

    // classify cases
    this.buildVisualizationModel();
    this.generateVisualizationStatistics();
    this.printGeneralStatistics();
  }

  get stringify() {
    return info(this.matchedCases);
  }

  buildVisualizationModel() {
    this.ruleset.rules.forEach(rule => {
      let ruleConditions = rule.conditions;
      let numberOfConditionsInRule = ruleConditions.length;

      this.dataset.cases.forEach(datasetCase => {
        let caseAttributes = datasetCase.attributes;
        let numberOfMatchedConditions = 0;
        let matchedConditionsMap = ruleConditions.reduce((matchedConditionsMap, condition) => {
          matchedConditionsMap[condition.name] = condition;

          return matchedConditionsMap;
        }, {});

        caseAttributes.forEach((attribute) => {
          let matchedCondition = matchedConditionsMap[attribute.name];

          if (matchedCondition && matchedCondition.hasInterval && matchedCondition.belongsToInterval(attribute.value)) {
            numberOfMatchedConditions++;
          } else if (matchedCondition && !matchedCondition.hasInterval) {
            if (attribute.isDoNotCare || attribute.isAttributeConcept) {
              numberOfMatchedConditions++;
            } else if (attribute.value === matchedCondition.value) {
              numberOfMatchedConditions++;
            }
          }
        });

        if (numberOfMatchedConditions > 0) {
          if (numberOfMatchedConditions === numberOfConditionsInRule && !datasetCase.hasLostValue) {
            rule.completelyMatchedCases.push(datasetCase);
          } else {
            rule.partiallyMatchedCases.push(datasetCase);
          }

          if (datasetCase.decision.value === rule.action.value) {
            rule.correctlyClassifiedCases.push(datasetCase);
          }
        }
      });
    });
  }

  generateVisualizationStatistics() {
    this.ruleset.rules.forEach(rule => {
      rule.ruleDomainSize = rule.completelyMatchedCases.length + rule.partiallyMatchedCases.length;
      rule.classifiedStrength = rule.correctlyClassifiedCases.length;
      rule.classifiedConditionalProbability = (rule.classifiedStrength/rule.ruleDomainSize).toFixed(2);
    });
  }

  /**
   * Build the LERS based classification model.
   *
   * @function buildClassificationModel
   */
  buildClassificationModel() {
    this.dataset.cases.forEach((datasetCase) => {
      this.ruleset.rules.forEach(rule => {
        let caseAttributes = datasetCase.attributes;
        let numberOfMatchedConditions = 0;
        let matchingCases = rule.matchingCases;
        let matchingFactor = 1.0;
        let matchingScore = 0;
        let ruleConditions = rule.conditions;
        let ruleDecision = rule.action.value;
        let numberOfConditionsInRule = rule.conditions.length;
        let specificity = this.shouldUseSpecificityReturnFactor ? 1.0 : rule.specificity;
        let strength = rule.strength;

        if (this.shouldUseConditionalProbability && !this.ruleset.hasRulesWithZeroMatchingCases) {
          strength /= matchingCases;
        }

        if (!this.matchedCases[datasetCase.index]) {
          this.matchedCases[datasetCase.index] = {};
        }

        let matchedCase = this.matchedCases[datasetCase.index];

        if (!matchedCase[ruleDecision]) {
          matchedCase[ruleDecision] = {
            isCompletelyMatched: false,
            score: matchingScore
          };
        }

        let matchedCaseDecision = matchedCase[ruleDecision];

        let matchedConditionsMap = ruleConditions.reduce((matchedConditionsMap, condition) => {
          matchedConditionsMap[condition.name] = condition;

          return matchedConditionsMap;
        }, {});

        caseAttributes.forEach((attribute) => {
          let matchedCondition = matchedConditionsMap[attribute.name];

          if (matchedCondition && matchedCondition.hasInterval && matchedCondition.belongsToInterval(attribute.value)) {
            numberOfMatchedConditions++;
          } else if (matchedCondition && !matchedCondition.hasInterval) {
            if (attribute.isDoNotCare || attribute.isAttributeConcept) {
              numberOfMatchedConditions++;
            } else if (attribute.value === matchedCondition.value) {
              numberOfMatchedConditions++;
            }
          }
        });

        /**
         * Attempt Complete Matching.
         */
        if (numberOfMatchedConditions === numberOfConditionsInRule && !datasetCase.hasLostValue) {
          matchingScore = strength * specificity * matchingFactor;
          matchedCaseDecision.isCompletelyMatched = true;
          rule.completelyMatchedCases.push(datasetCase);

          if (this.shouldUseSupportFromOtherRules) {
            matchedCaseDecision.score = matchingScore + matchedCaseDecision.score;
          } else if (matchedCaseDecision.score < matchingScore) {
            matchedCaseDecision.score = matchingScore;
          }
        }

        /**
         * Attempt Partial Matching.
         */
        if (numberOfMatchedConditions > 0) {
          let isCaseCompletelyMatched = Object.keys(matchedCase).some(decision => matchedCase[decision].isCompletelyMatched);

          if (!isCaseCompletelyMatched) {
            matchingFactor = !this.shouldUseMatchingFactor ? (numberOfMatchedConditions/numberOfConditionsInRule).toFixed(2) : matchingFactor;
            matchingScore = strength * specificity * matchingFactor;
            rule.partiallyMatchedCases.push(datasetCase);

            if (this.shouldUseSupportFromOtherRules) {
              matchedCaseDecision.score = matchingScore + matchedCaseDecision.score;
            } else if (matchedCaseDecision.score < matchingScore) {
              matchedCaseDecision.score = matchingScore;
            }
          }
        }
      });
    });
  }

  /**
   * Classify cases using the LERS model.
   *
   * @function classifyCases
   */
  classifyCases() {
    this.dataset.cases.forEach(datasetCase => {
      let caseConcepts = this.matchedCases[datasetCase.index];
      let caseConceptsLength = Object.keys(caseConcepts).length;
      let decisionWithHighestScore = null;
      let hasDuplicateDecisionsWithHighestScore = false;
      let zeroScores = [];
      let hasAllZeroScores = false;

      Object
        .keys(caseConcepts)
        .forEach((caseConceptKey, index) => {
          let caseConcept = caseConcepts[caseConceptKey];
          let caseConceptScore = caseConcept.score;

          if (!decisionWithHighestScore) {
            decisionWithHighestScore = caseConcept;
            decisionWithHighestScore.name = caseConceptKey;
          }

          if (index > 0) {
            if (decisionWithHighestScore.score === caseConceptScore) {
              hasDuplicateDecisionsWithHighestScore = true;
            } else {
              hasDuplicateDecisionsWithHighestScore = false;
            }

            if (!decisionWithHighestScore.isCompletelyMatched && caseConcept.isCompletelyMatched) {
              decisionWithHighestScore = caseConcept;
              decisionWithHighestScore.name = caseConceptKey;
            } else if (
              decisionWithHighestScore.score < caseConcept.score &&
              decisionWithHighestScore.isCompletelyMatched === caseConcept.isCompletelyMatched
            ) {
              decisionWithHighestScore = caseConcept;
              decisionWithHighestScore.name = caseConceptKey;
            }
          }

          if (caseConceptScore === 0) {
            zeroScores.push(caseConcept);
          }
        });

      if (zeroScores.length === caseConceptsLength) {
        hasAllZeroScores = true;
      }

      datasetCase.isClassified = !hasAllZeroScores && !hasDuplicateDecisionsWithHighestScore;
      datasetCase.isCompletelyMatched = datasetCase.isClassified && decisionWithHighestScore.isCompletelyMatched;
      datasetCase.isPartiallyMatched = datasetCase.isClassified && !decisionWithHighestScore.isCompletelyMatched;
      datasetCase.isCorrectlyClassified = datasetCase.isClassified && datasetCase.decision.value === decisionWithHighestScore.name;
      datasetCase.isIncorrectlyClassified = datasetCase.isClassified && datasetCase.decision.value !== decisionWithHighestScore.name;
    });
  }

  /**
   * Print General Statistics.
   *
   * @public
   * @function printGeneralStatistics
   */
  printGeneralStatistics() {
    let casesNotClassified = 0;
    let casesIncorrectlyClassified = 0;
    let casesCorrectlyClassified = 0;
    let totalNumberOfCases = this.dataset.cases.length;
    let totalNumberOfAttributes = this.dataset.cases[0].attributes.length;
    let totalNumberOfRules = this.ruleset.rules.length;

    this.dataset.cases.forEach(datasetCase => {
      casesNotClassified += !datasetCase.isClassified ? 1 : 0;
      casesIncorrectlyClassified += datasetCase.isIncorrectlyClassified ? 1 : 0;
      casesCorrectlyClassified += datasetCase.isCorrectlyClassified ? 1 : 0;
    });

    let errorRate = `${(((casesNotClassified + casesIncorrectlyClassified)/totalNumberOfCases) * 100).toFixed(2)}%`;

    this.generalStatistics = {
      casesNotClassified,
      casesIncorrectlyClassified,
      casesCorrectlyClassified,
      totalNumberOfCases,
      totalNumberOfAttributes,
      totalNumberOfRules,
      errorRate
    };
  }
}