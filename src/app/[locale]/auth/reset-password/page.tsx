import { ResetPasswordForm } from './reset-password-form';

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const searchParams = await props.searchParams;
  const tokenHash = searchParams.type === 'recovery' ? searchParams.token_hash : undefined;

  return <ResetPasswordForm tokenHash={tokenHash} />;
}
