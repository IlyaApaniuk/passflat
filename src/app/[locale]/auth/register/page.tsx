import { RegisterForm } from './register-form';

export default async function RegisterPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  return <RegisterForm next={searchParams.next} />;
}
