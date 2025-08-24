import { PortfolioCalculator } from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator';
import { PortfolioOrderItem } from '@ghostfolio/api/app/portfolio/interfaces/portfolio-order-item.interface';
import { getFactor } from '@ghostfolio/api/helper/portfolio.helper';
import { DATE_FORMAT } from '@ghostfolio/common/helper';
import {
  AssetProfileIdentifier,
  SymbolMetrics
} from '@ghostfolio/common/interfaces';
import { PortfolioSnapshot, TimelinePosition } from '@ghostfolio/common/models';
import { DateRange } from '@ghostfolio/common/types';
import { PerformanceCalculationType } from '@ghostfolio/common/types/performance-calculation-type.type';

import { Big } from 'big.js';
import { format, isBefore } from 'date-fns';
import { cloneDeep, sortBy } from 'lodash';

export class RoiPortfolioCalculator extends PortfolioCalculator {
  protected calculateOverallPerformance(
    positions: TimelinePosition[]
  ): PortfolioSnapshot {
    let currentValueInBaseCurrency = new Big(0);
    let grossPerformance = new Big(0);
    let grossPerformanceWithCurrencyEffect = new Big(0);
    let hasErrors = false;
    let netPerformance = new Big(0);
    let totalFeesWithCurrencyEffect = new Big(0);
    const totalInterestWithCurrencyEffect = new Big(0);
    let totalInvestment = new Big(0);
    let totalInvestmentWithCurrencyEffect = new Big(0);

    for (const currentPosition of positions) {
      if (currentPosition.feeInBaseCurrency) {
        totalFeesWithCurrencyEffect = totalFeesWithCurrencyEffect.plus(
          currentPosition.feeInBaseCurrency
        );
      }

      if (currentPosition.valueInBaseCurrency) {
        currentValueInBaseCurrency = currentValueInBaseCurrency.plus(
          currentPosition.valueInBaseCurrency
        );
      } else {
        hasErrors = true;
      }

      if (currentPosition.investment) {
        totalInvestment = totalInvestment.plus(currentPosition.investment);

        totalInvestmentWithCurrencyEffect =
          totalInvestmentWithCurrencyEffect.plus(
            currentPosition.investmentWithCurrencyEffect
          );
      } else {
        hasErrors = true;
      }

      if (currentPosition.grossPerformance) {
        grossPerformance = grossPerformance.plus(
          currentPosition.grossPerformance
        );

        grossPerformanceWithCurrencyEffect =
          grossPerformanceWithCurrencyEffect.plus(
            currentPosition.grossPerformanceWithCurrencyEffect
          );

        netPerformance = netPerformance.plus(currentPosition.netPerformance);
      } else if (!currentPosition.quantity.eq(0)) {
        hasErrors = true;
      }
    }

    return {
      currentValueInBaseCurrency,
      hasErrors,
      positions,
      totalFeesWithCurrencyEffect,
      totalInterestWithCurrencyEffect,
      totalInvestment,
      totalInvestmentWithCurrencyEffect,
      activitiesCount: this.activities.filter(({ type }) => {
        return ['BUY', 'SELL'].includes(type);
      }).length,
      createdAt: new Date(),
      errors: [],
      historicalData: [],
      totalLiabilitiesWithCurrencyEffect: new Big(0)
    };
  }

  protected getPerformanceCalculationType() {
    return PerformanceCalculationType.ROI;
  }

  protected getSymbolMetrics({
    chartDateMap,
    dataSource,
    end,
    exchangeRates,
    marketSymbolMap,
    start,
    symbol
  }: {
    chartDateMap?: { [date: string]: boolean };
    end: Date;
    exchangeRates: { [dateString: string]: number };
    marketSymbolMap: {
      [date: string]: { [symbol: string]: Big };
    };
    start: Date;
  } & AssetProfileIdentifier): SymbolMetrics {
    const currentExchangeRate = exchangeRates[format(new Date(), DATE_FORMAT)];
    let fees = new Big(0);
    let feesWithCurrencyEffect = new Big(0);
    let totalDividend = new Big(0);
    let totalDividendInBaseCurrency = new Big(0);
    let totalInterest = new Big(0);
    let totalInterestInBaseCurrency = new Big(0);
    let totalInvestment = new Big(0);
    let totalInvestmentWithCurrencyEffect = new Big(0);
    let totalLiabilities = new Big(0);
    let totalLiabilitiesInBaseCurrency = new Big(0);
    let totalUnits = new Big(0);

    // Get orders for this symbol
    const orders: PortfolioOrderItem[] = this.activities.filter(({ SymbolProfile }) => {
      return SymbolProfile.symbol === symbol;
    });

    if (orders.length <= 0) {
      return {
        currentValues: {},
        currentValuesWithCurrencyEffect: {},
        feesWithCurrencyEffect: new Big(0),
        grossPerformance: new Big(0),
        grossPerformancePercentage: new Big(0),
        grossPerformancePercentageWithCurrencyEffect: new Big(0),
        grossPerformanceWithCurrencyEffect: new Big(0),
        hasErrors: false,
        initialValue: new Big(0),
        initialValueWithCurrencyEffect: new Big(0),
        investmentValuesAccumulated: {},
        investmentValuesAccumulatedWithCurrencyEffect: {},
        investmentValuesWithCurrencyEffect: {},
        netPerformance: new Big(0),
        netPerformancePercentage: new Big(0),
        netPerformancePercentageWithCurrencyEffectMap: {},
        netPerformanceValues: {},
        netPerformanceValuesWithCurrencyEffect: {},
        netPerformanceWithCurrencyEffectMap: {},
        timeWeightedInvestment: new Big(0),
        timeWeightedInvestmentValues: {},
        timeWeightedInvestmentValuesWithCurrencyEffect: {},
        timeWeightedInvestmentWithCurrencyEffect: new Big(0),
        totalAccountBalanceInBaseCurrency: new Big(0),
        totalDividend: new Big(0),
        totalDividendInBaseCurrency: new Big(0),
        totalInterest: new Big(0),
        totalInterestInBaseCurrency: new Big(0),
        totalInvestment: new Big(0),
        totalInvestmentWithCurrencyEffect: new Big(0),
        totalLiabilities: new Big(0),
        totalLiabilitiesInBaseCurrency: new Big(0)
      };
    }

    const endDateString = format(end, DATE_FORMAT);
    let unitPriceAtEndDate = marketSymbolMap[endDateString]?.[symbol];

    // Fallback to manual price if needed
    const latestActivity = orders[orders.length - 1];
    if (
      dataSource === 'MANUAL' &&
      ['BUY', 'SELL'].includes(latestActivity?.type) &&
      latestActivity?.unitPrice &&
      !unitPriceAtEndDate
    ) {
      unitPriceAtEndDate = latestActivity.unitPrice;
    }

    if (!unitPriceAtEndDate) {
      return {
        currentValues: {},
        currentValuesWithCurrencyEffect: {},
        feesWithCurrencyEffect: new Big(0),
        grossPerformance: new Big(0),
        grossPerformancePercentage: new Big(0),
        grossPerformancePercentageWithCurrencyEffect: new Big(0),
        grossPerformanceWithCurrencyEffect: new Big(0),
        hasErrors: true,
        initialValue: new Big(0),
        initialValueWithCurrencyEffect: new Big(0),
        investmentValuesAccumulated: {},
        investmentValuesAccumulatedWithCurrencyEffect: {},
        investmentValuesWithCurrencyEffect: {},
        netPerformance: new Big(0),
        netPerformancePercentage: new Big(0),
        netPerformancePercentageWithCurrencyEffectMap: {},
        netPerformanceWithCurrencyEffectMap: {},
        netPerformanceValues: {},
        netPerformanceValuesWithCurrencyEffect: {},
        timeWeightedInvestment: new Big(0),
        timeWeightedInvestmentValues: {},
        timeWeightedInvestmentValuesWithCurrencyEffect: {},
        timeWeightedInvestmentWithCurrencyEffect: new Big(0),
        totalAccountBalanceInBaseCurrency: new Big(0),
        totalDividend: new Big(0),
        totalDividendInBaseCurrency: new Big(0),
        totalInterest: new Big(0),
        totalInterestInBaseCurrency: new Big(0),
        totalInvestment: new Big(0),
        totalInvestmentWithCurrencyEffect: new Big(0),
        totalLiabilities: new Big(0),
        totalLiabilitiesInBaseCurrency: new Big(0)
      };
    }

    // Process all orders for ROI calculation
    for (const order of orders) {
      const factor = getFactor(order.type);
      const orderDate = format(new Date(order.date), DATE_FORMAT);
      const exchangeRateForOrder = exchangeRates[orderDate] || 1;

      if (['BUY', 'SELL'].includes(order.type)) {
        const orderValue = order.quantity.mul(order.unitPrice);
        const orderValueWithCurrencyEffect = orderValue.mul(exchangeRateForOrder);

        totalInvestment = totalInvestment.plus(orderValue.mul(factor));
        totalInvestmentWithCurrencyEffect = totalInvestmentWithCurrencyEffect.plus(
          orderValueWithCurrencyEffect.mul(factor)
        );

        totalUnits = totalUnits.plus(order.quantity.mul(factor));

        if (order.fee) {
          fees = fees.plus(order.fee);
        }

        if (order.feeInBaseCurrency) {
          feesWithCurrencyEffect = feesWithCurrencyEffect.plus(order.feeInBaseCurrency);
        } else if (order.fee) {
          feesWithCurrencyEffect = feesWithCurrencyEffect.plus(
            order.fee.mul(exchangeRateForOrder)
          );
        }
      } else if (order.type === 'DIVIDEND') {
        totalDividend = totalDividend.plus(order.quantity);
        totalDividendInBaseCurrency = totalDividendInBaseCurrency.plus(
          order.quantity.mul(exchangeRateForOrder)
        );
      } else if (order.type === 'INTEREST') {
        totalInterest = totalInterest.plus(order.quantity);
        totalInterestInBaseCurrency = totalInterestInBaseCurrency.plus(
          order.quantity.mul(exchangeRateForOrder)
        );
      } else if (order.type === 'LIABILITY') {
        totalLiabilities = totalLiabilities.plus(order.quantity);
        totalLiabilitiesInBaseCurrency = totalLiabilitiesInBaseCurrency.plus(
          order.quantity.mul(exchangeRateForOrder)
        );
      }
    }

    // Calculate current value
    const currentValue = totalUnits.mul(unitPriceAtEndDate);
    const currentValueWithCurrencyEffect = currentValue.mul(currentExchangeRate);

    // Calculate ROI performance
    const grossPerformance = currentValue.minus(totalInvestment);
    const grossPerformanceWithCurrencyEffect = currentValueWithCurrencyEffect.minus(
      totalInvestmentWithCurrencyEffect
    );

    const netPerformance = grossPerformance.minus(fees);
    const netPerformanceWithCurrencyEffect = grossPerformanceWithCurrencyEffect.minus(
      feesWithCurrencyEffect
    );

    // Calculate percentages
    let grossPerformancePercentage = new Big(0);
    let grossPerformancePercentageWithCurrencyEffect = new Big(0);
    let netPerformancePercentage = new Big(0);
    let netPerformancePercentageWithCurrencyEffect = new Big(0);

    if (totalInvestment.gt(0)) {
      grossPerformancePercentage = grossPerformance.div(totalInvestment);
      netPerformancePercentage = netPerformance.div(totalInvestment);
    }

    if (totalInvestmentWithCurrencyEffect.gt(0)) {
      grossPerformancePercentageWithCurrencyEffect = grossPerformanceWithCurrencyEffect.div(
        totalInvestmentWithCurrencyEffect
      );
      netPerformancePercentageWithCurrencyEffect = netPerformanceWithCurrencyEffect.div(
        totalInvestmentWithCurrencyEffect
      );
    }

    // Create simple maps for ROI
    const netPerformancePercentageWithCurrencyEffectMap: { [key: string]: Big } = {};
    const netPerformanceWithCurrencyEffectMap: { [key: string]: Big } = {};
    netPerformancePercentageWithCurrencyEffectMap['max'] = netPerformancePercentageWithCurrencyEffect;
    netPerformanceWithCurrencyEffectMap['max'] = netPerformanceWithCurrencyEffect;

    return {
      currentValues: {
        [endDateString]: currentValue
      },
      currentValuesWithCurrencyEffect: {
        [endDateString]: currentValueWithCurrencyEffect
      },
      feesWithCurrencyEffect,
      grossPerformance,
      grossPerformancePercentage,
      grossPerformancePercentageWithCurrencyEffect,
      grossPerformanceWithCurrencyEffect,
      hasErrors: false,
      initialValue: totalInvestment,
      initialValueWithCurrencyEffect: totalInvestmentWithCurrencyEffect,
      investmentValuesAccumulated: {
        [endDateString]: totalInvestment
      },
      investmentValuesAccumulatedWithCurrencyEffect: {
        [endDateString]: totalInvestmentWithCurrencyEffect
      },
      investmentValuesWithCurrencyEffect: {
        [endDateString]: totalInvestmentWithCurrencyEffect
      },
      netPerformance,
      netPerformancePercentage,
      netPerformancePercentageWithCurrencyEffectMap,
      netPerformanceValues: {
        [endDateString]: netPerformance
      },
      netPerformanceValuesWithCurrencyEffect: {
        [endDateString]: netPerformanceWithCurrencyEffect
      },
      netPerformanceWithCurrencyEffectMap,
      timeWeightedInvestment: totalInvestment, // For ROI, no time weighting
      timeWeightedInvestmentValues: {
        [endDateString]: totalInvestment
      },
      timeWeightedInvestmentValuesWithCurrencyEffect: {
        [endDateString]: totalInvestmentWithCurrencyEffect
      },
      timeWeightedInvestmentWithCurrencyEffect: totalInvestmentWithCurrencyEffect,
      totalAccountBalanceInBaseCurrency: new Big(0),
      totalDividend,
      totalDividendInBaseCurrency,
      totalInterest,
      totalInterestInBaseCurrency,
      totalInvestment,
      totalInvestmentWithCurrencyEffect,
      totalLiabilities,
      totalLiabilitiesInBaseCurrency
    };
  }
}
