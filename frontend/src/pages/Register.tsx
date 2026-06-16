import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { TextInput, PasswordInput, Button, Paper, Title, Text, Container, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useAuth } from '../contexts/AuthContext';
import { TURNSTILE_SITE_KEY } from '../lib/turnstile';

interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
}

export default function Register() {
  const navigate = useNavigate();
  const { register, isLoading, error } = useAuth();
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileRef = useRef<TurnstileInstance>(null);

  const form = useForm<RegisterForm>({
    initialValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
      password: (value) => (value.length >= 6 ? null : 'Password must be at least 6 characters'),
      confirmPassword: (value, values) =>
        value === values.password ? null : 'Passwords do not match',
    },
  });

  const handleSubmit = async (values: RegisterForm) => {
    await register(values.email, values.password, captchaToken);
    // Turnstile tokens are single-use; reset for any subsequent attempt.
    setCaptchaToken('');
    turnstileRef.current?.reset();
    if (!error) {
      navigate('/collection');
    }
  };

  return (
    <Container size={420} my={40}>
      <Title ta="center">Create an account</Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: 'inherit', textDecoration: 'underline' }}>
          Sign in
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
            <PasswordInput
              label="Confirm Password"
              placeholder="Confirm your password"
              required
              {...form.getInputProps('confirmPassword')}
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
              Create account
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}

 