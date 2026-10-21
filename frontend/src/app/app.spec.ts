import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

const PM = { id: 2, email: 'pm@staffsync.local', firstName: 'Ana', lastName: 'P', role: 'PM' };

describe('App', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  function logInAs(user: object): void {
    localStorage.setItem('staffsync.token', 'jwt');
    localStorage.setItem('staffsync.user', JSON.stringify(user));
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('sends a logged-out user to /login', async () => {
    TestBed.createComponent(App);
    await router.navigateByUrl('/home');
    expect(router.url).toBe('/login');
  });

  it('sends a logged-in user from / to /home', async () => {
    logInAs(PM);
    TestBed.createComponent(App);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/home');
  });

  it('blocks a direct URL that belongs to another role and goes to /home', async () => {
    logInAs(PM);
    TestBed.createComponent(App);
    await router.navigateByUrl('/admin/users');
    expect(router.url).toBe('/home');
  });

  it("allows a page of the user's own role", async () => {
    logInAs(PM);
    TestBed.createComponent(App);
    await router.navigateByUrl('/projects');
    expect(router.url).toBe('/projects');
  });

  it('keeps a logged-in user off the login page', async () => {
    logInAs(PM);
    TestBed.createComponent(App);
    await router.navigateByUrl('/login');
    expect(router.url).toBe('/home');
  });

  afterEach(() => httpMock.verify());
});
