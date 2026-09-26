import { Link } from 'react-router';
import { EmptyState, Button } from '@/components/ui';
export function NotFoundPage() {
  return <EmptyState title="Page not found" body="This route does not exist in the prototype." action={<Link to="/today"><Button>Go to Today</Button></Link>} />;
}
