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
    const currentValues: { [date: string]: Big } = {};
    const currentValuesWithCurrencyEffect: { [date: string]: Big } = {};
    let fees = new Big(0);
    let feesAtStartDate = new Big(0);
    let feesAtStartDateWithCurrencyEffect = new Big(0);
    let feesWithCurrencyEffect = new Big(0);
    let grossPerformance = new Big(0);
    let grossPerformanceWithCurrencyEffect = new Big(0);
    let grossPerformanceAtStartDate = new Big(0);
    let grossPerformanceAtStartDateWithCurrencyEffect = new Big(0);
    let grossPerformanceFromSells = new Big(0);
    let grossPerformanceFromSellsWithCurrencyEffect = new Big(0);
    let initialValue: Big;
    let initialValueWithCurrencyEffect: Big;
    let investmentAtStartDate: Big;
    let investmentAtStartDateWithCurrencyEffect: Big;
    const investmentValuesAccumulated: { [date: string]: Big } = {};
    const investmentValuesAccumulatedWithCurrencyEffect: {
      [date: string]: Big;
    } = {};
    const investmentValuesWithCurrencyEffect: { [date: string]: Big } = {};
    let lastAveragePrice = new Big(0);
    let lastAveragePriceWithCurrencyEffect = new Big(0);
    const netPerformanceValues: { [date: string]: Big } = {};
    const netPerformanceValuesWithCurrencyEffect: { [date: string]: Big } = {};
    
    // For ROI, we don't use time-weighted investment, just simple investment tracking
    const timeWeightedInvestmentValues: { [date: string]: Big } = {};
    const timeWeightedInvestmentValuesWithCurrencyEffect: {
      [date: string]: Big;
    } = {};

    const totalAccountBalanceInBaseCurrency = new Big(0);
    let totalDividend = new Big(0);
    let totalDividendInBaseCurrency = new Big(0);
    let totalInterest = new Big(0);
    let totalInterestInBaseCurrency = new Big(0);
    let totalInvestment = new Big(0);
    let totalInvestmentFromBuyTransactions = new Big(0);
    let totalInvestmentFromBuyTransactionsWithCurrencyEffect = new Big(0);
    let totalInvestmentWithCurrencyEffect = new Big(0);
    let totalLiabilities = new Big(0);
    let totalLiabilitiesInBaseCurrency = new Big(0);
    let totalQuantityFromBuyTransactions = new Big(0);
    let totalUnits = new Big(0);
    let valueAtStartDate: Big;
    let valueAtStartDateWithCurrencyEffect: Big;

    // Clone orders to keep the original values in this.orders
    let orders: PortfolioOrderItem[] = cloneDeep(
      this.activities.filter(({ SymbolProfile }) => {
        return SymbolProfile.symbol === symbol;
      })
    );

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

    const dateOfFirstTransaction = new Date(orders[0].date);

    const endDateString = format(end, DATE_FORMAT);
    const startDateString = format(start, DATE_FORMAT);

    const unitPriceAtStartDate = marketSymbolMap[startDateString]?.[symbol];
    let unitPriceAtEndDate = marketSymbolMap[endDateString]?.[symbol];

    let latestActivity = orders[orders.length - 1];

    if (
      dataSource === 'MANUAL' &&
      ['BUY', 'SELL'].includes(latestActivity?.type) &&
      latestActivity?.unitPrice &&
      !unitPriceAtEndDate
    ) {
      // For BUY / SELL activities with a MANUAL data source where no historical market price is available,
      // the calculation should fall back to using the activity's unit price.
      unitPriceAtEndDate = latestActivity.unitPrice;
    }

    if (
      !unitPriceAtEndDate ||
      (!unitPriceAtStartDate && isBefore(dateOfFirstTransaction, start))
    ) {
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

    // Add a synthetic order at the start and the end date for ROI calculation
    orders.push({
      date: startDateString,
      fee: new Big(0),
      feeInBaseCurrency: new Big(0),
      itemType: 'start',
      quantity: new Big(0),
      SymbolProfile: {
        dataSource,
        symbol
      },
      type: 'BUY',
      unitPrice: unitPriceAtStartDate
    });

    orders.push({
      date: endDateString,
      fee: new Big(0),
      feeInBaseCurrency: new Big(0),
      itemType: 'end',
      quantity: new Big(0),
      SymbolProfile: {
        dataSource,
        symbol
      },
      type: 'BUY',
      unitPrice: unitPriceAtEndDate
    });

    orders = sortBy(orders, (order) => {
      return order.date;
    });

    const indexOfStartOrder = orders.findIndex((order) => {
      return order.itemType === 'start';
    });

    const indexOfEndOrder = orders.findIndex((order) => {
      return order.itemType === 'end';
    });

    let totalInvestmentForROI = new Big(0);
    let totalInvestmentWithCurrencyEffectForROI = new Big(0);

    // Calculate simple investment totals for ROI
    for (let i = 0; i < indexOfEndOrder; i++) {
      const order = orders[i];

      if (['BUY', 'SELL'].includes(order.type) && order.itemType !== 'start') {
        const factor = getFactor(order.type);

        const orderValue = order.quantity.mul(order.unitPrice);
        const orderValueWithCurrencyEffect = orderValue.mul(
          exchangeRates[order.date]
        );

        totalInvestmentForROI = totalInvestmentForROI.plus(
          orderValue.mul(factor)
        );
        totalInvestmentWithCurrencyEffectForROI = totalInvestmentWithCurrencyEffectForROI.plus(
          orderValueWithCurrencyEffect.mul(factor)
        );

        if (order.feeInBaseCurrency) {
          feesWithCurrencyEffect = feesWithCurrencyEffect.plus(
            order.feeInBaseCurrency
          );
        }

        if (order.fee) {
          fees = fees.plus(order.fee);
        }

        if (order.type === 'BUY') {
          totalQuantityFromBuyTransactions = totalQuantityFromBuyTransactions.plus(
            order.quantity
          );
          totalInvestmentFromBuyTransactions = totalInvestmentFromBuyTransactions.plus(
            orderValue
          );
          totalInvestmentFromBuyTransactionsWithCurrencyEffect = totalInvestmentFromBuyTransactionsWithCurrencyEffect.plus(
            orderValueWithCurrencyEffect
          );
        }

        totalUnits = totalUnits.plus(order.quantity.mul(factor));

        if (order.type === 'DIVIDEND') {
          totalDividend = totalDividend.plus(order.quantity);
          totalDividendInBaseCurrency = totalDividendInBaseCurrency.plus(
            orderValueWithCurrencyEffect
          );
        } else if (order.type === 'INTEREST') {
          totalInterest = totalInterest.plus(order.quantity);
          totalInterestInBaseCurrency = totalInterestInBaseCurrency.plus(
            orderValueWithCurrencyEffect
          );
        } else if (order.type === 'LIABILITY') {
          totalLiabilities = totalLiabilities.plus(order.quantity);
          totalLiabilitiesInBaseCurrency = totalLiabilitiesInBaseCurrency.plus(
            orderValueWithCurrencyEffect
          );
        }
      }
    }

    // Simple ROI calculation - no time weighting
    totalInvestment = totalInvestmentForROI;
    totalInvestmentWithCurrencyEffect = totalInvestmentWithCurrencyEffectForROI;

    const currentValue = totalUnits.mul(unitPriceAtEndDate);
    const currentValueWithCurrencyEffect = currentValue.mul(currentExchangeRate);

    // Calculate gross performance
    grossPerformance = currentValue.minus(totalInvestment);
    grossPerformanceWithCurrencyEffect = currentValueWithCurrencyEffect.minus(
      totalInvestmentWithCurrencyEffect
    );

    // Net performance (subtract fees)
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

    // Set up chart data (simplified for ROI)
    const netPerformancePercentageWithCurrencyEffectMap: { [key: string]: Big } = {};
    const netPerformanceWithCurrencyEffectMap: { [key: string]: Big } = {};

    // Use 'max' as the key for simple ROI calculation
    netPerformancePercentageWithCurrencyEffectMap['max'] = netPerformancePercentageWithCurrencyEffect;
    netPerformanceWithCurrencyEffectMap['max'] = netPerformanceWithCurrencyEffect;

    if (unitPriceAtStartDate) {
      initialValue = totalUnits.mul(unitPriceAtStartDate);
      initialValueWithCurrencyEffect = initialValue.mul(
        exchangeRates[startDateString]
      );
      
      investmentAtStartDate = totalInvestment;
      investmentAtStartDateWithCurrencyEffect = totalInvestmentWithCurrencyEffect;
      
      valueAtStartDate = initialValue;
      valueAtStartDateWithCurrencyEffect = initialValueWithCurrencyEffect;
    } else {
      initialValue = new Big(0);
      initialValueWithCurrencyEffect = new Big(0);
      investmentAtStartDate = new Big(0);
      investmentAtStartDateWithCurrencyEffect = new Big(0);
      valueAtStartDate = new Big(0);
      valueAtStartDateWithCurrencyEffect = new Big(0);
    }

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
      initialValue,
      initialValueWithCurrencyEffect,
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
      timeWeightedInvestment: totalInvestment, // For ROI, time-weighted = simple investment
      timeWeightedInvestmentValues: {
        [endDateString]: totalInvestment
      },
      timeWeightedInvestmentValuesWithCurrencyEffect: {
        [endDateString]: totalInvestmentWithCurrencyEffect
      },
      timeWeightedInvestmentWithCurrencyEffect: totalInvestmentWithCurrencyEffect,
      totalAccountBalanceInBaseCurrency,
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
