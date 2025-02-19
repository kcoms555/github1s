/**
 * @file github authentication page
 * @author netcon
 * @updated by kcoms555 for Enterprise
 */

import { Barrier } from '@/helpers/async';
import { getExtensionContext } from '@/helpers/context';
import * as vscode from 'vscode';
import { GitHubEnterpriseTokenManager } from './token';
import { createPageHtml, getWebviewOptions } from '@/helpers/page';
import { messageApiMap } from './settings';

export class GitHubEnterprise1sAuthenticationView {
	private static instance: GitHubEnterprise1sAuthenticationView | null = null;
	public static viewType = 'github1s.views.githubenterprise1s-authentication';
	private webviewPanel: vscode.WebviewPanel | null = null;
	// using for waiting token
	private tokenBarrier: Barrier | null = null;
	// using for displaying open page reason
	private notice: string = '';

	private constructor() {}

	public static getInstance(): GitHubEnterprise1sAuthenticationView {
		if (GitHubEnterprise1sAuthenticationView.instance) {
			return GitHubEnterprise1sAuthenticationView.instance;
		}
		return (GitHubEnterprise1sAuthenticationView.instance = new GitHubEnterprise1sAuthenticationView());
	}

	private registerListeners() {
		if (!this.webviewPanel) {
			throw new Error('webview is not inited yet');
		}
		const tokenManager = GitHubEnterpriseTokenManager.getInstance();

		this.webviewPanel.webview.onDidReceiveMessage((message) => {
			const commonResponse = { id: message.id, type: message.type };
			const postMessage = (data?: unknown) => this.webviewPanel!.webview.postMessage({ ...commonResponse, data });

			switch (message.type) {
				case 'get-notice':
					postMessage(this.notice);
					break;
				case 'get-token':
					postMessage(tokenManager.getToken());
					break;
				case 'set-token':
					message.data && (this.notice = '');
					tokenManager.setToken(message.data || '').then(() => postMessage());
					break;
				case 'validate-token':
					tokenManager.validateToken(message.data).then((tokenStatus) => postMessage(tokenStatus));
					break;
				case 'connect-to-github':
					vscode.commands.executeCommand('github1s.commands.vscode.connectToGitHubEnterprise').then((data: any) => {
						if (data && data.error_description) {
							vscode.window.showErrorMessage(data.error_description);
						} else if (data && data.access_token) {
							tokenManager.setToken(data.access_token || '').then(() => postMessage());
						}
						postMessage();
					});
					break;
				case 'call-vscode-message-api':
					const messageApi = messageApiMap[message.data?.level];
					messageApi && messageApi(...message.data?.args).then((response) => postMessage(response));
					break;
			}
		});

		tokenManager.onDidChangeToken((token) => {
			this.tokenBarrier && this.tokenBarrier.open();
			this.tokenBarrier && (this.tokenBarrier = null);
			this.webviewPanel?.webview.postMessage({ type: 'token-changed', token });
		});
	}

	public open(notice: string = '', withBarriar = false) {
		const extensionContext = getExtensionContext();

		this.notice = notice;
		withBarriar && !this.tokenBarrier && (this.tokenBarrier = new Barrier(600 * 1000));

		if (!this.webviewPanel) {
			this.webviewPanel = vscode.window.createWebviewPanel(
				GitHubEnterprise1sAuthenticationView.viewType,
				'Authenticating to GitHub Enterprise',
				vscode.ViewColumn.One,
				getWebviewOptions(extensionContext.extensionUri)
			);
			this.registerListeners();
			this.webviewPanel.onDidDispose(() => (this.webviewPanel = null));
		}

		const styles = [
			vscode.Uri.joinPath(extensionContext.extensionUri, 'assets/pages/components.css').toString(),
			vscode.Uri.joinPath(extensionContext.extensionUri, 'assets/pages/github1s-authentication.css').toString(),
		];
		const scripts = [
			vscode.Uri.joinPath(
				extensionContext.extensionUri,
				'assets/pages/githubenterprise1s-authentication.js'
			).toString(),
		];

		const webview = this.webviewPanel.webview;
		webview.html = createPageHtml('Authenticating To GitHub Enterprise', styles, scripts);
		return withBarriar ? this.tokenBarrier!.wait() : Promise.resolve();
	}
}
