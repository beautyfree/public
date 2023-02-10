import React from 'react';
import BigNumber from 'bignumber.js';
import { Tooltip } from '@chakra-ui/react';

export function formatExact(value: string | number | BigNumber) {
  const bignum = new BigNumber(value);
  return bignum.isNaN() ? '0' : bignum.toFormat();
}

export function formatToken(
  value: string | number | BigNumber,
  digits = 4,
  exactTip?: boolean,
  noTrim?: boolean,
  // by default we truncate for tokens
  round?: boolean,
  exact?: boolean,
): React.ReactNode {
  const bn = new BigNumber(value);
  if (exact) {
    return formatExact(value);
  }
  if (
    bn.isLessThan(1 / 10 ** digits) &&
    !bn.isLessThanOrEqualTo(new BigNumber(0))
  ) {
    return (
      <Tooltip title={formatExact(value)}>{`< ${1 / 10 ** digits}`}</Tooltip>
    );
  }

  const contents = bn.toFormat(digits, round ? 4 : 1);

  return exactTip ? (
    <Tooltip title={formatExact(value)}>{contents}</Tooltip>
  ) : (
    contents
  );
}

export function formatRoundedToken(
  value: string | number,
  rounded?: boolean,
): string {
  const bn = new BigNumber(value);
  if (bn.isLessThan(0.0001) && !bn.isLessThanOrEqualTo(new BigNumber(0))) {
    return '< 0.0001';
  }

  return bn.toFormat(
    !bn.isLessThan(1000) || rounded ? 0 : 2,
    4, // ROUND_HALF_UP
  );
}

export function formatUsd(
  value: string | number | BigNumber,
  omitPrefix?: boolean,
  rounded?: boolean,
  sigFigs?: number,
  noTrim?: boolean,
): string {
  const bn = new BigNumber(value);
  const neg = bn.isLessThan(0);
  const abs = bn.abs();
  if (value === '0' && sigFigs)
    return `${neg ? '-' : ''}${omitPrefix ? '' : '$'}${Number(abs).toPrecision(
      sigFigs + 1,
    )}`;
  if (sigFigs && bn.lt(0.1)) {
    return `${neg ? '-' : ''}${omitPrefix ? '' : '$'}${Number(abs).toPrecision(
      sigFigs,
    )}`;
  }
  if (
    !noTrim &&
    bn.isLessThan(0.01) &&
    !bn.isLessThanOrEqualTo(new BigNumber(0))
  ) {
    return `< ${omitPrefix ? '' : '$'}0.01`;
  }
  // When we have to do token price conversion into USD, we are often either too precise
  // or not precise enough to fully net a number back to 0. This accounts for that inaccuracy
  if (bn.abs().isLessThan(0.0001)) {
    return `${omitPrefix ? '' : '$'}0${rounded ? '' : '.00'}`;
  }

  return `${neg ? '-' : ''}${omitPrefix ? '' : '$'}${abs.toFormat(
    rounded ? 0 : 2,
  )}`;
}

export function formatPercent(
  value: string | number | BigNumber,
  noTrim?: boolean,
  limit: number = 0.0001,
) {
  const bnPercent = new BigNumber(value);
  if (
    bnPercent.isLessThan(limit) &&
    !bnPercent.isLessThanOrEqualTo(new BigNumber(0))
  ) {
    return '< 0.01%';
  }

  return noTrim
    ? `${bnPercent.multipliedBy(100)}%`
    : `${bnPercent.multipliedBy(100).toFormat(2)}%`;
}

export function formatCompact(value: BigNumber) {
  const formatter = Intl.NumberFormat('en', { notation: 'compact' });
  return formatter.format(Number(value.toString()));
}
