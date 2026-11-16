import { describe, expect, it } from 'vitest';
import { canManageB2B, parseB2BCsv, requireIndividualKey, normalizeDomain, exportB2BCsv } from '@/lib/b2b';
describe('individual B2B',()=>{
 it('accepts the ZIP prospect columns while retaining company and contact identity',()=>{expect(parseB2BCsv('company_name,domain,contact_name,contact_role,email,phone\nEmpresa ZIP,example.com,Contato ZIP,Diretor,contato@example.com,11999990000')).toEqual([{name:'Contato ZIP',company:'Empresa ZIP',domain:'example.com',email:'contato@example.com',phone:'11999990000'}]);expect(parseB2BCsv('company_name,domain\nEmpresa ZIP,example.com')[0]?.name).toBe('Empresa ZIP');});
 it('never falls back to an owner credential when disconnected',()=>{expect(()=>requireIndividualKey(null)).toThrow('Conecte sua própria conta');expect(requireIndividualKey('individual-account')).toBe('individual-account');});
 it('restricts B2B management to the existing admin role',()=>{expect(canManageB2B('admin')).toBe(true);expect(canManageB2B('seller')).toBe(false);expect(canManageB2B(undefined)).toBe(false);});
 it('keeps portable CSV imports with quoted values and Portuguese headings',()=>{expect(parseB2BCsv('nome;empresa;dominio;telefone\n"Contato, Um";Empresa;https://www.empresa.com.br/;11999990000')).toEqual([{name:'Contato, Um',company:'Empresa',domain:'empresa.com.br',email:'',phone:'11999990000'}]);});
 it('rejects a CSV without a company or contact name',()=>{expect(()=>parseB2BCsv('email\ncontato@example.com')).toThrow('nome obrigatório');});
 it('accepts exactly 100 CSV records and rejects 101',()=>{expect(parseB2BCsv('nome\n'+Array(100).fill('Empresa').join('\n'))).toHaveLength(100);expect(()=>parseB2BCsv('nome\n'+Array(101).fill('Empresa').join('\n'))).toThrow('1 a 100');});
 it('rejects arbitrary URL destinations',()=>{expect(()=>normalizeDomain('localhost:8080')).toThrow();expect(()=>normalizeDomain('https://127.0.0.1')).toThrow();expect(normalizeDomain('https://www.example.com/path')).toBe('example.com');});
 it('escapes spreadsheet formula injection in exported CSV',()=>{expect(exportB2BCsv([{name:'=1+1',company:'',domain:'',email:'',phone:''}])).toContain("'=1+1");});
});
