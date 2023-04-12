import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AlreadyExistsError, FeeTooLowError, TimeoutError, ValidationError } from './offchain';

// Logger for throwing http errors
export const httpLogger = (error: any) => {
  Logger.error(error);

  if (error instanceof ValidationError || error instanceof FeeTooLowError) {
    throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
  }
  if (error instanceof TimeoutError) {
    throw new HttpException(error.message, HttpStatus.REQUEST_TIMEOUT);
  }
  if (error instanceof AlreadyExistsError) {
    throw new HttpException(error.message, HttpStatus.CONFLICT);
  }
  if (error instanceof Error) {
    throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
  if (typeof error === "string") {
    throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
  }
  throw new HttpException("Unknown error", HttpStatus.INTERNAL_SERVER_ERROR);
};