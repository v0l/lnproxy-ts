import { IsString, IsNumber, IsBoolean } from 'class-validator';

export class invoiceDto {
  @IsString()
  request: string;
  @IsNumber()
  fee: number;
  @IsBoolean()
  feeInclusive: boolean;
}
