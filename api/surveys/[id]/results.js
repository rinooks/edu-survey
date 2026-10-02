import { allowMethods, handle, sendJson, queryParam } from '../../../lib/api/http.js';
import { requireAdmin } from '../../../lib/api/auth.js';
import { aggregate, getResponses, getSurveyById } from '../../../lib/api/survey.js';

export default handle(async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;
  requireAdmin(req);
  const survey = await getSurveyById(queryParam(req, 'id'));
  const responses = await getResponses(survey.id);
  sendJson(res, 200, { survey, results: aggregate(survey, responses) });
});
