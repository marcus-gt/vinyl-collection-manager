import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { TextInput, PasswordInput, Button, Paper, Title, Text, Container, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useAuth } from '../contexts/AuthContext';
import { TURNSTILE_SITE_KEY } from '../lib/turnstile';

interface LoginForm {
  email: string;
  password: string;
}

function Login() {
  const navigate = useNavigate();
  const { login, isLoading, error } = useAuth();
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef<TurnstileInstance>(null);

  const form = useForm<LoginForm>({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
      password: (value) => (value.length >= 6 ? null : 'Password must be at least 6 characters'),
    },
  });

  const handleSubmit = async (values: LoginForm) => {
    await login(values.email, values.password, captchaToken);
    // Turnstile tokens are single-use; reset for any subsequent attempt.
    setCaptchaToken('');
    turnstileRef.current?.reset();
    if (!error) {
      navigate('/collection');
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Welcome back!</Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        Don't have an account yet?{' '}
        <Link to="/register" style={{ color: 'inherit', textDecoration: 'underline' }}>
          Create account
        </Link>
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack>
            <TextInput
              label="Email"
              placeholder="you@example.com"
              required
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Password"
              placeholder="Your password"
              required
              {...form.getInputProps('password')}
            />
            <Turnstile
              ref={turnstileRef}
              siteKey={TURNSTILE_SITE_KEY}
              options={{ appearance: 'interaction-only' }}
              onSuccess={setCaptchaToken}
              onError={() => setCaptchaToken('')}
              onExpire={() => setCaptchaToken('')}
            />
            {error && (
              <Text c="red" size="sm">
                {error}
              </Text>
            )}
            <Button type="submit" loading={isLoading} disabled={!captchaToken}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}

export default Login; 
