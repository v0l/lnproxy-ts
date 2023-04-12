import {
  AuthenticatedLnd,
  createHodlInvoice,
  decodePaymentRequest,
  getHeight,
  getInvoice,
  probeForRoute,
} from 'lightning';

import subscribeToInvoices from './subscribe_to_invoices';
import { AlreadyExistsError, FeeTooLowError, NoRouteError, ValidationError } from '.';
import { Logger } from '@nestjs/common';

const dateDiff = (m: string, n: string) =>
  Math.abs((new Date(m).getTime() - new Date(n).getTime()) / 1000);

const defaultCltvDelta = 80;
const defaultProbeTimeoutMs = 1000 * 60 * 2;
const hodlExpiry = (m: string) => new Date(new Date(m).getTime()).toISOString();
const knownFeatures = [8, 9, 14, 15, 16, 17];
const lowCltvDelta = 10;
const maxCltvDelta = 2016;
const minDateDiffSec = 60 * 5;
const minTokens = 1;

interface Args {
  lnd: AuthenticatedLnd
  request: string
  fee: number
  feeInclusive: boolean
  skipProbe: boolean
}

export default async function ({ lnd, request, fee: serviceFee, feeInclusive, skipProbe }: Args) {
  if (!lnd) {
    throw new ValidationError('ExpectedAuthenticatedLndToCreateHodlInvoice');
  }

  if (!request) {
    throw new ValidationError('ExpectedBolt11PaymentRequestToCreateHodlInvoice');
  }

  const details = await decodePaymentRequest({ lnd, request });

  if (!details.cltv_delta) {
    throw new ValidationError('ExpectedCltvDeltaInThePaymentRequest');
  }

  if (details.cltv_delta < lowCltvDelta) {
    throw new ValidationError('ExpectedHigherCltvDeltaInThePaymentRequest');
  }

  if (details.expires_at < new Date().toISOString()) {
    throw new ValidationError('ExpectedUnexpiredPaymentRequest');
  }

  if (
    dateDiff(details.expires_at, new Date().toISOString()) <
    minDateDiffSec
  ) {
    throw new ValidationError('PaymentRequestExpiresSoon');
  }

  if (details.tokens < minTokens) {
    throw new ValidationError('ZeroAmountPaymentRequestAreNotAccepted');
  }

  if (!details.features.length) {
    throw new ValidationError('ExpectedFeatureBitsInPaymentRequest');
  }

  if (details.cltv_delta > maxCltvDelta) {
    throw new ValidationError('ExpectedLowerCltvDeltaInPaymentReqest');
  }

  details.features.forEach((n) => {
    if (!knownFeatures.includes(n.bit) || !n.is_known) {
      throw new ValidationError(`UnExpectedFeatureBitInPaymentRequest ${n.type}`);
    }
  });

  try {
    await getInvoice({ lnd, id: details.id });
    throw new AlreadyExistsError('InvoiceWithPaymentHashAlreadyExists');
  } catch (e) {
    if (e instanceof AlreadyExistsError) {
      throw e; // only throw if expected error kind
    }
  }

  let cltvDelta = 0;
  let fee = "0";
  if (!skipProbe) {
    const probe = await probeForRoute({
      lnd,
      cltv_delta: details.cltv_delta,
      destination: details.destination,
      features: details.features,
      mtokens: details.mtokens,
      payment: details.payment,
      probe_timeout_ms: defaultProbeTimeoutMs,
      routes: details.routes,
      total_mtokens: details.mtokens
    });

    if (!probe.route) {
      throw new NoRouteError('FailedToFindRouteToPayRequest');
    }

    const height = await getHeight({ lnd });
    cltvDelta = probe.route.timeout - height.current_block_height;
    fee = probe.route.fee_mtokens;
  }

  const bServiceFee = BigInt(serviceFee);
  const bFee = BigInt(fee);

  if (feeInclusive && bFee >= bServiceFee) {
    throw new FeeTooLowError('ServiceFeeLowerThanRoutingFee');
  }

  const maxFee = feeInclusive ? bServiceFee : bFee + bServiceFee;
  const totalAmount = BigInt(details.mtokens) + maxFee;

  const result = await createHodlInvoice({
    lnd,
    cltv_delta: cltvDelta + defaultCltvDelta,
    description: details.description,
    description_hash: details.description_hash,
    id: details.id,
    mtokens: String(totalAmount),
    expires_at: hodlExpiry(details.expires_at),
  });

  subscribeToInvoices({
    lnd,
    maxFee: Number(maxFee),
    request,
    expiry: hodlExpiry(details.expires_at),
    id: details.id,
  }).catch(Logger.error);

  return result;
}
