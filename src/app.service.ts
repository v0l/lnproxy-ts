import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { authenticatedLnd } from './lnd';
import { createHodlInvoice } from './offchain';
import { CreateHodlInvoiceResult, getWalletInfo } from 'lightning';
import { httpLogger } from './utils';
import { invoiceDto } from './class_controller';

@Injectable()
export class AppService implements OnModuleInit {
  async onModuleInit() {
    try {
      const { lnd } = await authenticatedLnd({});
      const result = await getWalletInfo({ lnd });

      Logger.log({
        is_authenticated_to_lnd: true,
        pubkey: result.public_key,
        alias: result.alias || undefined,
      });
    } catch (err: any) {
      throw new Error(err);
    }
  }

  async getInvoice(args: invoiceDto): Promise<CreateHodlInvoiceResult> {
    try {
      const { lnd } = await authenticatedLnd({});

      return await createHodlInvoice({
        lnd,
        ...args
      });
    } catch (error) {
      httpLogger(error);
    }
  }
}
