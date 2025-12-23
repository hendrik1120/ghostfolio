import { Activity } from '@ghostfolio/api/app/order/interfaces/activities.interface';
import {
  activityDummyData,
  symbolProfileDummyData,
  userDummyData
} from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator-test-utils';
import { PortfolioCalculatorFactory } from '@ghostfolio/api/app/portfolio/calculator/portfolio-calculator.factory';
import { CurrentRateService } from '@ghostfolio/api/app/portfolio/current-rate.service';
import { CurrentRateServiceMock } from '@ghostfolio/api/app/portfolio/current-rate.service.mock';
import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { RedisCacheServiceMock } from '@ghostfolio/api/app/redis-cache/redis-cache.service.mock';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { ExchangeRateDataServiceMock } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service.mock';
import { PortfolioSnapshotService } from '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service';
import { PortfolioSnapshotServiceMock } from '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service.mock';
import { parseDate } from '@ghostfolio/common/helper';
import { PerformanceCalculationType } from '@ghostfolio/common/types/performance-calculation-type.type';

import { Big } from 'big.js';

jest.mock('@ghostfolio/api/app/portfolio/current-rate.service', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    CurrentRateService: jest.fn().mockImplementation(() => {
      return CurrentRateServiceMock;
    })
  };
});

jest.mock(
  '@ghostfolio/api/services/queues/portfolio-snapshot/portfolio-snapshot.service',
  () => {
    return {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      PortfolioSnapshotService: jest.fn().mockImplementation(() => {
        return PortfolioSnapshotServiceMock;
      })
    };
  }
);

jest.mock('@ghostfolio/api/app/redis-cache/redis-cache.service', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    RedisCacheService: jest.fn().mockImplementation(() => {
      return RedisCacheServiceMock;
    })
  };
});

jest.mock(
  '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service',
  () => {
    return {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ExchangeRateDataService: jest.fn().mockImplementation(() => {
        return ExchangeRateDataServiceMock;
      })
    };
  }
);

describe('RoiPortfolioCalculator', () => {
  let configurationService: ConfigurationService;
  let currentRateService: CurrentRateService;
  let exchangeRateDataService: ExchangeRateDataService;
  let portfolioCalculatorFactory: PortfolioCalculatorFactory;
  let portfolioSnapshotService: PortfolioSnapshotService;
  let redisCacheService: RedisCacheService;

  beforeEach(() => {
    configurationService = new ConfigurationService();

    currentRateService = new CurrentRateService(null, null, null, null);

    exchangeRateDataService = new ExchangeRateDataService(
      null,
      null,
      null,
      null
    );

    portfolioSnapshotService = new PortfolioSnapshotService(null);

    redisCacheService = new RedisCacheService(null, null);

    portfolioCalculatorFactory = new PortfolioCalculatorFactory(
      configurationService,
      currentRateService,
      exchangeRateDataService,
      portfolioSnapshotService,
      redisCacheService
    );
  });

  describe('get current positions', () => {
    it.only('with GOOGL buy', async () => {
      jest.useFakeTimers().setSystemTime(parseDate('2023-07-10').getTime());

      const activities: Activity[] = [
        {
          ...activityDummyData,
          date: new Date('2023-01-03'),
          feeInAssetProfileCurrency: 1,
          quantity: 1,
          SymbolProfile: {
            ...symbolProfileDummyData,
            currency: 'USD',
            dataSource: 'YAHOO',
            name: 'Alphabet Inc.',
            symbol: 'GOOGL'
          },
          type: 'BUY',
          unitPriceInAssetProfileCurrency: 89.12
        }
      ];

      const portfolioCalculator = portfolioCalculatorFactory.createCalculator({
        activities,
        calculationType: PerformanceCalculationType.ROI,
        currency: 'CHF',
        userId: userDummyData.id
      });

      const portfolioSnapshot = await portfolioCalculator.computeSnapshot();

      expect(portfolioSnapshot).toMatchObject({
        currentValueInBaseCurrency: new Big('103.10483'),
        errors: [],
        hasErrors: false,
        positions: [
          {
            averagePrice: new Big('89.12'),
            currency: 'USD',
            dataSource: 'YAHOO',
            dividend: new Big('0'),
            dividendInBaseCurrency: new Big('0'),
            fee: new Big('1'),
            feeInBaseCurrency: new Big('0.9238'),
            firstBuyDate: '2023-01-03',
            grossPerformance: new Big('27.33'),
            grossPerformancePercentage: new Big('0.30669144981412639406'),
            grossPerformancePercentageWithCurrencyEffect: new Big('0.2523504459956397'),
            grossPerformanceWithCurrencyEffect: new Big('20.775774'),
            investment: new Big('89.12'),  // Full investment for ROI, not time-weighted
            investmentWithCurrencyEffect: new Big('82.329056'),
            marketPrice: 116.45,
            marketPriceInBaseCurrency: 103.10483,
            netPerformance: new Big('26.33'),
            netPerformancePercentage: new Big('0.295462322691126394'),
            netPerformancePercentageWithCurrencyEffect: new Big('0.24112962014285697628'),
            netPerformanceWithCurrencyEffectMap: {
              max: new Big('19.851974')
            },
            quantity: new Big('1'),
            symbol: 'GOOGL',
            tags: [],
            timeWeightedInvestment: new Big('89.12'),  // For ROI = simple investment
            timeWeightedInvestmentWithCurrencyEffect: new Big('82.329056'),
            transactionCount: 1,
            valueInBaseCurrency: new Big('103.10483')
          }
        ],
        totalFeesWithCurrencyEffect: new Big('0.9238'),
        totalInterestWithCurrencyEffect: new Big('0'),
        totalInvestment: new Big('89.12'),  // Full investment for ROI
        totalInvestmentWithCurrencyEffect: new Big('82.329056'),
        totalLiabilitiesWithCurrencyEffect: new Big('0')
      });

      expect(portfolioSnapshot.historicalData[portfolioSnapshot.historicalData.length - 1]).toMatchObject(
        expect.objectContaining({
          netPerformance: 26.33,
          netPerformanceInPercentage: 0.295462322691126394,
          netPerformanceInPercentageWithCurrencyEffect: 0.24112962014285697628,
          netPerformanceWithCurrencyEffect: 19.851974,
          totalInvestmentValueWithCurrencyEffect: 82.329056
        })
      );
    });
  });
});