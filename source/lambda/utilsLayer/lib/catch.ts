// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { logger } from "./logger";

/**
 * @description generic decorator for catching AWS service client exceptions
 * @param errorType - known error type to catch
 * @param raiseException - whether or not raise exception
 * @returns
 */
export const catchDecorator = (
  errorType: any,
  raiseException: boolean
): any => {
  return (_: any, key: string | symbol, descriptor?: PropertyDescriptor) => {
    if (!descriptor) {
      logger.warn({
        label: "decorator error",
        message: `descriptor not found`,
      });
      return;
    }

    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
      try {
        const result = originalMethod.apply(this, args);
        if (result && result instanceof Promise)
          return result.catch((error: any) => {
            _handleError(error, key, errorType, raiseException);
          });
        return result;
      } catch (error) {
        _handleError(error, key, errorType, raiseException);
      }
    };
    return descriptor;
  };
};

/**
 * @desription method to log different messages based on error
 * @param error
 * @param key
 * @param errorType
 * @param raiseException
 */
const _handleError = (
  error: any,
  key: string | symbol,
  errorType: any,
  raiseException: boolean
) => {
  if (error instanceof errorType)
    logger.warn({
      label: key,
      message: `${error.name} - ${error.message}`,
    });
  else
    logger.warn({
      label: key,
      message: `unexpected error: ${error}`,
    });
  if (raiseException) throw error;
};
