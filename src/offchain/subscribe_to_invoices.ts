import {
  AuthenticatedLnd,
  cancelHodlInvoice,
  payViaPaymentRequest,
  settleHodlInvoice,
  subscribeToInvoice,
} from 'lightning';

import { auto } from 'async';
import { Logger } from '@nestjs/common';

type Args = {
  expiry: string;
  id: string;
  lnd: AuthenticatedLnd;
  request: string;
  maxFee: number;
};
export default async function ({ expiry, id, lnd, maxFee, request }: Args) {
  await auto({
    validate: (cbk: any) => {
      if (!expiry) {
        return cbk([400, 'ExpectedHodlInvoiceExpiryToSubscribeToInvoices']);
      }

      if (!id) {
        return cbk([400, 'ExpectedInvoiceIdToSubscribeToInvoices']);
      }

      if (!lnd) {
        return cbk([400, 'ExpectedAuthenticatedLndToSubscribeToInvoices']);
      }

      return cbk();
    },

    // Intercept virtual invoice forwards
    subscribe: [
      'validate',
      ({ }, cbk: any) => {
        const sub = subscribeToInvoice({ id, lnd });

        // Stop listening for the HTLC when the invoice expires
        const timeout = setTimeout(() => {
          sub.removeAllListeners();

          return cbk([408, 'TimedOutWaitingForPayment']);
        }, new Date(expiry).getTime() - new Date().getTime());

        const finished = async (err: any, res?: any) => {
          clearTimeout(timeout);
          Logger.log(`Payment finished: ${id}`, err, res);

          sub.removeAllListeners();

          if (!!err || (!err && !res)) {
            try {
              await cancelHodlInvoice({ id, lnd });
            } catch (err) {
              return cbk(err);
            }
          }

          return cbk(err, res);
        };

        sub.on('invoice_updated', async (req) => {
          try {
            if (!!req.payments && req.payments.length) {
              Logger.log(`Attempting payment: ${id}, maxFee=${maxFee}`);
              const result = await payViaPaymentRequest({
                lnd,
                request,
                max_fee: maxFee,
              });

              Logger.log(`Payment result: ${id}`, result);
              if (!!result.secret) {
                await settleHodlInvoice({ lnd, secret: result.secret });
                await finished(null, req);
              }
            }
          } catch (err) {
            await finished(err);
          }
        });

        sub.on('error', async (err) => {
          await finished(err);
        });

        return;
      },
    ],
  });
}
