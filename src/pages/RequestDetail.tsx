import { Navigate, useParams } from "react-router-dom";
const RequestDetail = () => {
  const { id } = useParams();
  return <Navigate to={`/requests/${id}/respond`} replace />;
};
export default RequestDetail;
