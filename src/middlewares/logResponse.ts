import { Application } from 'express'

import { Config } from '../types'
import { getTraceFields } from '../utils/request/getTraceFields'
import { getNamespace } from 'cls-hooked'

const namespace = getNamespace('scoped-request')
const externalLogs = namespace?.get('externalLogs')

export const logResponse = (app: Application, config: Config) => {
  app.use((req, res, next) => {
    const ignoredRoute = config.log.requestResponse?.ignore?.includes(req.path)

    if (ignoredRoute) {
      return next()
    }

    const trace = getTraceFields(req)
    const message = [
      `Status: [${res.statusCode}]`,
      `Api: [${req.method.toUpperCase()} ${req.path}]`,
      `Origin: [${trace.origin.application}]`,
      `Ip: [${trace.origin.ip}]`,
      `User: [${trace.origin.user}]`,
    ].join(' - ')

    const isError = res.statusCode >= 400
    const isGet = req.method.toUpperCase() === 'GET'
    const isIgnoredBodyRoute = config.log.requestResponse?.ignoreBody?.includes(
      req.path,
    )
    const isFullGetResponse = config.log.requestResponse?.logGetBodyResponse?.includes(
      req.path
    )

    let body = res.contentBody
    if (!isError && !isFullGetResponse && (isIgnoredBodyRoute || isGet)) {
      body = {}
    }

    const isLogError = res.statusCode >= 500
    const logger = (isLogError ? req.log.error : req.log.info).bind(req.log)
    const detail = req.detailError
    const prettyDetail = detail && JSON.stringify(detail)
    const errorObj = detail && {
      name: detail.name,
      message: detail.message,
    }

    const logDetails = {
      response: {
        headers: res.getHeaders(),
        body: typeof body === 'object' ? JSON.stringify(body) : body,
        ...(prettyDetail && { detail: prettyDetail }),
      },
      natural: {
        ...trace,
        ...(errorObj && { errorObj }),
        method: req.method.toUpperCase(),
        responseStatusCode: res.statusCode,
        elapsedTime: Math.abs(req.startTime - new Date().getTime()),
        isLoggedIn: Boolean(req.headers['x-provider-id']),
        isError,
      },
    };


    if (externalLogs && externalLogs.length >= 1) {
      const [{ externalLog: { naturals, ...externalLog}, externalName }] = externalLogs;

      logDetails[externalName] = externalLog;

      logDetails.natural = {
        ...logDetails.natural,
        ...naturals
      }
    }

    logger('RESPONSE', message, logDetails)

    return next()
  })
}
