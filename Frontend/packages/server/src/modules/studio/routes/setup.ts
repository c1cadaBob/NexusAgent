import Router from '@koa/router'
import * as ctrl from '../controllers/setup'

export const setupPublicRoutes = new Router()
setupPublicRoutes.get('/api/setup/status', ctrl.setupStatus)
setupPublicRoutes.post('/api/setup/bootstrap', ctrl.bootstrap)

export const setupSessionRoutes = new Router()
setupSessionRoutes.post('/api/setup/admin', ctrl.admin)
setupSessionRoutes.post('/api/setup/model', ctrl.model)
setupSessionRoutes.post('/api/setup/gateway', ctrl.gateway)
setupSessionRoutes.post('/api/setup/validate', ctrl.validate)
setupSessionRoutes.post('/api/setup/complete', ctrl.complete)
