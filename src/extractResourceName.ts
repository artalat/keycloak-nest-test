import { ContextType, ExecutionContext } from '@nestjs/common';

type GqlContextType = 'graphql' | ContextType;

export const extractResourceName =
  (options: any) =>
  (context: ExecutionContext): string => {
    const { key, fallback = '' } = options;

    let resource = fallback;

    // Check if request is coming from graphql or http
    if (context.getType() === 'http') {
      const body = context.switchToHttp().getRequest().body;
      if (body && body[key]) {
        resource = body[key];
      }
    } else if (context.getType<GqlContextType>() === 'graphql') {
      // let gql: any;
      // // Check if graphql is installed
      // try {
      //   gql = require('@nestjs/graphql');
      // } catch (er) {
      //   throw new Error('@nestjs/graphql is not installed, cannot proceed');
      // }

      // // graphql request
      // const gqlContext = gql.GqlExecutionContext.create(context).getContext();

      // request = gqlContext.req;

      const args = context.getArgs() as any;

      if (args && args[key]) {
        resource = args[key];
      }
    }

    return resource;
  };
