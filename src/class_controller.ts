import { IsString, IsNumber } from 'class-validator';

export class invoiceDto {
  @IsString()
  request: string;
  @IsNumber()
  fee: number;
}
