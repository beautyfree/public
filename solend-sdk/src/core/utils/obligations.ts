import { Connection, PublicKey } from "@solana/web3.js";
import BigNumber from "bignumber.js";
import { Obligation, parseObligation } from "../../state";
import { PoolType } from "../types";
import { getBatchMultipleAccountsInfo } from "./utils";
import { U64_MAX } from "../../classes/constants";

export type FormattedObligation = ReturnType<typeof formatObligation>

export function formatObligation(
  obligation: { pubkey: PublicKey; info: Obligation },
  pool: PoolType
) {
  const poolAddress = obligation.info.lendingMarket.toBase58();
  let minPriceUserTotalSupply = new BigNumber(0);
  let minPriceBorrowLimit = new BigNumber(0);
  let maxPriceUserTotalWeightedBorrow = new BigNumber(0);

  const deposits = obligation.info.deposits
    .filter((d) => d.depositedAmount.toString() !== "0")
    .map((d) => {
      const reserveAddress = d.depositReserve.toBase58();
      const reserve = pool.reserves.find((r) => r.address === reserveAddress);

      if (!reserve)
        throw Error("Deposit in obligation does not exist in the pool");

      const amount = new BigNumber(d.depositedAmount.toString())
        .shiftedBy(-reserve.decimals)
        .times(reserve.cTokenExchangeRate);
      const amountUsd = amount.times(reserve.price);

      minPriceUserTotalSupply = minPriceUserTotalSupply.plus(
        amount.times(reserve.minPrice)
      );

      minPriceBorrowLimit = minPriceBorrowLimit.plus(
        amount.times(reserve.minPrice).times(reserve.loanToValueRatio)
      );

      return {
        liquidationThreshold: reserve.liquidationThreshold,
        loanToValueRatio: reserve.loanToValueRatio,
        symbol: reserve.symbol,
        price: reserve.price,
        reserveAddress,
        amount,
        amountUsd,
      };
    });

  const borrows = obligation.info.borrows
    .filter((b) => b.borrowedAmountWads.toString() !== "0")
    .map((b) => {
      const reserveAddress = b.borrowReserve.toBase58();
      const reserve = pool.reserves.find((r) => r.address === reserveAddress);
      if (!reserve)
        throw Error("Borrow in obligation does not exist in the pool");

      const amount = new BigNumber(b.borrowedAmountWads.toString())
        .shiftedBy(-18 - reserve.decimals)
        .times(reserve.cumulativeBorrowRate)
        .dividedBy(
          new BigNumber(b.cumulativeBorrowRateWads.toString()).shiftedBy(-18)
        );
      const amountUsd = amount.times(reserve.price);

      const maxPrice = reserve.emaPrice
        ? BigNumber.max(reserve.emaPrice, reserve.price)
        : reserve.price;

      maxPriceUserTotalWeightedBorrow = maxPriceUserTotalWeightedBorrow.plus(
        amount
          .times(maxPrice)
          .times(reserve.borrowWeight ? reserve.borrowWeight : U64_MAX)
      );

      return {
        liquidationThreshold: reserve.liquidationThreshold,
        loanToValueRatio: reserve.loanToValueRatio,
        symbol: reserve.symbol,
        price: reserve.price,
        reserveAddress,
        amount,
        amountUsd,
        weightedAmountUsd: new BigNumber(reserve.borrowWeight).multipliedBy(
          amountUsd
        ),
      };
    });

  const totalSupplyValue = deposits.reduce(
    (acc, d) => acc.plus(d.amountUsd),
    new BigNumber(0)
  );
  const totalBorrowValue = borrows.reduce(
    (acc, b) => acc.plus(b.amountUsd),
    new BigNumber(0)
  );
  const weightedTotalBorrowValue = borrows.reduce(
    (acc, b) => acc.plus(b.weightedAmountUsd),
    new BigNumber(0)
  );

  const borrowLimit = deposits.reduce(
    (acc, d) => d.amountUsd.times(d.loanToValueRatio).plus(acc),
    BigNumber(0)
  );
  const liquidationThreshold = deposits.reduce(
    (acc, d) => d.amountUsd.times(d.liquidationThreshold).plus(acc),
    BigNumber(0)
  );
  const netAccountValue = totalSupplyValue.minus(totalBorrowValue);
  const liquidationThresholdFactor = totalSupplyValue.isZero()
    ? new BigNumber(0)
    : liquidationThreshold.dividedBy(totalSupplyValue);
  const borrowLimitFactor = totalSupplyValue.isZero()
    ? new BigNumber(0)
    : borrowLimit.dividedBy(totalSupplyValue);
  const borrowUtilization = borrowLimit.isZero()
    ? new BigNumber(0)
    : totalBorrowValue.dividedBy(borrowLimit);
  const weightedBorrowUtilization = minPriceBorrowLimit.isZero()
    ? new BigNumber(0)
    : weightedTotalBorrowValue.dividedBy(borrowLimit);
  const isBorrowLimitReached = borrowUtilization.isGreaterThanOrEqualTo(
    new BigNumber("1")
  );
  const borrowOverSupply = totalSupplyValue.isZero()
    ? new BigNumber(0)
    : totalBorrowValue.dividedBy(totalSupplyValue);

  const positions =
    obligation.info.deposits.filter((d) => !d.depositedAmount.isZero()).length +
    obligation.info.borrows.filter((b) => !b.borrowedAmountWads.isZero())
      .length;

  const weightedConservativeBorrowUtilization = minPriceBorrowLimit.isZero()
    ? new BigNumber(0)
    : maxPriceUserTotalWeightedBorrow.dividedBy(minPriceBorrowLimit);

  return {
    address: obligation.pubkey.toBase58(),
    positions,
    deposits,
    borrows,
    poolAddress,
    totalSupplyValue,
    totalBorrowValue,
    borrowLimit,
    liquidationThreshold,
    netAccountValue,
    liquidationThresholdFactor,
    borrowLimitFactor,
    borrowUtilization,
    weightedConservativeBorrowUtilization,
    weightedBorrowUtilization,
    isBorrowLimitReached,
    borrowOverSupply,
    weightedTotalBorrowValue,
    minPriceUserTotalSupply,
    minPriceBorrowLimit,
    maxPriceUserTotalWeightedBorrow,
  };
}

export async function fetchObligationByAddress(
  obligationAddress: string,
  connection: Connection,
  debug?: boolean
) {
  if (debug) console.log("fetchObligationByAddress");

  const rawObligationData = await connection.getAccountInfo(
    new PublicKey(obligationAddress)
  );

  if (!rawObligationData) {
    return null;
  }

  const parsedObligation = parseObligation(
    new PublicKey(obligationAddress),
    rawObligationData!
  );

  if (!parsedObligation) {
    return null;
  }

  return parsedObligation;
}

export async function fetchObligationsByAddress(
  obligationAddresses: Array<string>,
  connection: Connection,
  debug?: boolean
) {
  if (debug)
    console.log("fetchObligationsByAddress", obligationAddresses.length);
  const rawObligations = await getBatchMultipleAccountsInfo(
    obligationAddresses,
    connection
  );

  const parsedObligations = rawObligations
    .map((obligation, index) =>
      obligation
        ? parseObligation(new PublicKey(obligationAddresses[index]), obligation)
        : null
    )
    .filter(Boolean) as Array<{ info: Obligation; pubkey: PublicKey }>;

  return parsedObligations;
}
